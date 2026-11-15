import type { HostKvApi, SendMessageFn } from "@grok/agent-sdk";
import { defineChannel, localDevStrict, POST, sharedSecretAuth } from "@grok/agent-sdk/channels";
import type { ChannelStartArgs } from "@grok/agent-sdk";
import * as z from "zod/v4";

import { comandoAgendamentos, listarAgendamentos, processarAgendamentos } from "../lib/agenda.js";
import { aceitarTermos, decidirTermos, lerConta, operarConta, TEXTO_RECUSA } from "../lib/banco.js";
import { RESPOSTA_AJUDA, RESPOSTA_SEM_CONTA, respostaContaAberta } from "../lib/respostas.js";
import {
  type Atualizacao,
  type EstadoTelegram,
  AVISO_FALHA,
  RESPOSTA_SEM_TEXTO,
  chaveEntrega,
  chaveUpdate,
  configurarPerfil,
  enviarTermos,
  enviarTexto,
  gravarOffset,
  idDaAtualizacao,
  interpretarAtualizacao,
  lerAtualizacoes,
  lerMemoria,
  lerOffset,
  montarEntrada,
  mostrarDigitando,
  registrarTroca,
  responderCallback,
  soltarWebhook,
} from "../lib/atendimento.js";

const estadoInicial: EstadoTelegram = {
  chatId: "",
  updateId: 0,
  mensagemId: 0,
  textoCliente: "",
  nome: "cliente",
};

type MensagemRecebida = Exclude<Atualizacao, { tipo: "ignorar" }>;

type Despacho = {
  send: SendMessageFn;
  kv: HostKvApi;
};

export default defineChannel<EstadoTelegram>({
  state: estadoInicial,
  auth: [
    localDevStrict(),
    sharedSecretAuth({
      header: "x-telegram-bot-api-secret-token",
      secret: "TELEGRAM_WEBHOOK_SECRET",
    }),
  ],
  async onStart(args) {
    const perfil = await configurarPerfil();
    args.logger(perfil ? "Perfil LinhaBank atualizado no Telegram." : "Perfil do Telegram não atualizado.");
    iniciarAgendamentos(args.host.kv, args.logger);
    if (process.env.TELEGRAM_POLL !== "1") return;
    void ouvir(args).catch(() => {
      args.logger("A escuta do Telegram parou.");
    });
  },
  routes: [
    POST("/webhook", {
      description: "Recebe uma atualização do Telegram e responde como a Thialinha.",
      bodySchema: z.unknown(),
      handler: async (_request, route) => {
        const atualizacao = interpretarAtualizacao(route.body);
        if (atualizacao.tipo === "ignorar") return new Response(null, { status: 202 });
        route.waitUntil(
          despachar(atualizacao, { send: route.send, kv: route.host.kv }).catch(() => undefined),
        );
        return new Response(null, { status: 202 });
      },
    }),
  ],
  events: {
    async "message.completed"(event, channel, ctx) {
      if (event.data.finishReason !== "stop" || event.data.parentCallId !== undefined) return;
      const resposta = event.data.text.trim();
      const { chatId, updateId, mensagemId, textoCliente, nome } = channel.state;
      if (resposta.length === 0 || chatId.length === 0) return;
      await entregar(ctx.host.kv, {
        chatId,
        updateId,
        mensagemId,
        nome,
        textoCliente,
        resposta,
        sessionId: ctx.session.id,
      });
    },
    async "turn.failed"(_event, channel, ctx) {
      const { chatId, updateId, mensagemId, textoCliente, nome } = channel.state;
      if (chatId.length === 0) return;
      await entregar(ctx.host.kv, {
        chatId,
        updateId,
        mensagemId,
        nome,
        textoCliente,
        resposta: AVISO_FALHA,
        sessionId: ctx.session.id,
      });
    },
  },
});

async function despachar(atualizacao: MensagemRecebida, deps: Despacho): Promise<void> {
  const visto = chaveUpdate(atualizacao.updateId);
  if ((await deps.kv.get(visto)) !== undefined) return;
  await deps.kv.put(visto, true);

  if (atualizacao.tipo === "sem_texto") {
    await responderSemTexto(deps.kv, atualizacao);
    return;
  }

  if (atualizacao.tipo === "callback") {
    await responderCallback(atualizacao.callbackId);
    if (atualizacao.decisao === "ignorar") return;
    if (atualizacao.decisao === "recuso") {
      if ((await lerConta(deps.kv, atualizacao.chatId)) === undefined) {
        await enviarTexto(atualizacao.chatId, TEXTO_RECUSA, atualizacao.mensagemId);
      }
      return;
    }
    const jaTinha = (await lerConta(deps.kv, atualizacao.chatId)) !== undefined;
    await aceitarTermos(deps.kv, atualizacao.chatId, atualizacao.nome);
    if (jaTinha) {
      await enviarPadrao(deps.kv, atualizacao, RESPOSTA_AJUDA);
      return;
    }
    await enviarPadrao(deps.kv, atualizacao, await textoContaAberta(deps.kv, atualizacao));
    return;
  }

  const decisao = decidirTermos(atualizacao.texto);
  const existente = await lerConta(deps.kv, atualizacao.chatId);
  if (comandoAgendamentos(atualizacao.texto)) {
    if (existente === undefined) {
      await enviarTexto(atualizacao.chatId, RESPOSTA_SEM_CONTA, atualizacao.mensagemId);
      return;
    }
    const lista = await listarAgendamentos(deps.kv, atualizacao.chatId);
    await enviarPadrao(deps.kv, atualizacao, lista.texto);
    return;
  }
  if (existente === undefined && decisao === "pedir") {
    await enviarTermos(atualizacao.chatId, atualizacao.mensagemId);
    return;
  }
  if (existente === undefined && decisao === "recuso") {
    await enviarTexto(atualizacao.chatId, TEXTO_RECUSA, atualizacao.mensagemId);
    return;
  }
  if (existente !== undefined && decisao === "pedir") {
    await enviarPadrao(deps.kv, atualizacao, RESPOSTA_AJUDA);
    return;
  }
  const abriuAgora = existente === undefined && decisao === "concordo";
  if (abriuAgora) {
    await aceitarTermos(deps.kv, atualizacao.chatId, atualizacao.nome);
    await enviarPadrao(deps.kv, atualizacao, await textoContaAberta(deps.kv, atualizacao));
    return;
  }
  await falar(deps, atualizacao, atualizacao.texto, false);
}

async function textoContaAberta(kv: HostKvApi, atualizacao: MensagemRecebida): Promise<string> {
  const resumo = await operarConta(kv, atualizacao.chatId, `abertura:${atualizacao.updateId}`, { acao: "resumo" });
  if (resumo.ok !== true || resumo.conta === undefined || resumo.saldo === undefined) return RESPOSTA_AJUDA;
  return respostaContaAberta({
    agencia: resumo.conta.agencia,
    numero: resumo.conta.numero,
    chave: resumo.conta.chaveTransferencia,
    saldo: resumo.saldo,
  });
}

async function enviarPadrao(kv: HostKvApi, atualizacao: MensagemRecebida, texto: string): Promise<void> {
  const ok = await enviarTexto(atualizacao.chatId, texto, atualizacao.mensagemId);
  if (!ok) return;
  await registrarTroca(kv, atualizacao.chatId, atualizacao.nome, atualizacao.tipo === "texto" ? atualizacao.texto : "CONCORDO", texto, "padrao");
}

async function falar(
  deps: Despacho,
  atualizacao: MensagemRecebida,
  texto: string,
  acabouDeAbrir: boolean,
): Promise<void> {
  const memoria = await lerMemoria(deps.kv, atualizacao.chatId);
  memoria.nome = atualizacao.nome;
  const aberta = (await lerConta(deps.kv, atualizacao.chatId)) !== undefined;
  try {
    void mostrarDigitando(atualizacao.chatId);
    await deps.send(montarEntrada(texto, memoria, { aberta, acabouDeAbrir }), {
      continuationToken: `tg:${atualizacao.chatId}:${atualizacao.updateId}`,
      title: `Telegram ${atualizacao.chatId}`,
      state: {
        chatId: atualizacao.chatId,
        updateId: atualizacao.updateId,
        mensagemId: atualizacao.mensagemId,
        textoCliente: texto,
        nome: atualizacao.nome,
      },
    });
  } catch {
    await entregar(deps.kv, {
      chatId: atualizacao.chatId,
      updateId: atualizacao.updateId,
      mensagemId: atualizacao.mensagemId,
      nome: atualizacao.nome,
      textoCliente: texto,
      resposta: AVISO_FALHA,
      sessionId: "sem-turno",
    });
  }
}

async function responderSemTexto(
  kv: HostKvApi,
  atualizacao: { chatId: string; mensagemId: number; nome: string },
): Promise<void> {
  const ok = await enviarTexto(atualizacao.chatId, RESPOSTA_SEM_TEXTO, atualizacao.mensagemId);
  if (!ok) return;
  await registrarTroca(
    kv,
    atualizacao.chatId,
    atualizacao.nome,
    "[mensagem sem texto]",
    RESPOSTA_SEM_TEXTO,
    "sem-turno",
  );
}

async function entregar(
  kv: HostKvApi,
  entrega: {
    chatId: string;
    updateId: number;
    mensagemId: number;
    nome: string;
    textoCliente: string;
    resposta: string;
    sessionId: string;
  },
): Promise<void> {
  const chave = chaveEntrega(entrega.chatId, entrega.updateId);
  if ((await kv.get(chave)) !== undefined) return;
  const enviado = await enviarTexto(entrega.chatId, entrega.resposta, entrega.mensagemId);
  if (!enviado && process.env.TELEGRAM_BOT_TOKEN) return;
  await kv.put(chave, true);
  await registrarTroca(
    kv,
    entrega.chatId,
    entrega.nome,
    entrega.textoCliente,
    entrega.resposta,
    entrega.sessionId,
  );
}

let agendaLigada = false;

function iniciarAgendamentos(kv: HostKvApi, logger: (linha: string) => void): void {
  if (agendaLigada) return;
  agendaLigada = true;
  const pulso = () => {
    void processarAgendamentos(kv).catch(() => {
      logger("PIX agendado não foi processado neste ciclo.");
    });
  };
  pulso();
  const timer = setInterval(pulso, 20_000);
  timer.unref();
}

async function ouvir(args: ChannelStartArgs): Promise<void> {
  const solto = await soltarWebhook();
  args.logger(solto ? "Thialinha escutando o Telegram." : "Thialinha não soltou o webhook.");
  for (;;) {
    const offset = await lerOffset(args.host.kv);
    const lote = await lerAtualizacoes(offset);
    if (!lote.ok) {
      if (lote.codigo === 409) await soltarWebhook();
      args.logger(`Escuta do Telegram indisponível (${lote.codigo}).`);
      await esperar(lote.codigo === 401 ? 30000 : 2000);
      continue;
    }
    for (const item of lote.itens) {
      const id = idDaAtualizacao(item);
      if (id !== undefined) await gravarOffset(args.host.kv, id + 1);
      const atualizacao = interpretarAtualizacao(item);
      if (atualizacao.tipo === "ignorar") continue;
      await despachar(atualizacao, { send: args.send, kv: args.host.kv });
    }
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}
