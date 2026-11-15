import type { HostKvApi, SendMessageFn } from "@grok/agent-sdk";
import { defineChannel, localDevStrict, POST, sharedSecretAuth } from "@grok/agent-sdk/channels";
import type { ChannelStartArgs } from "@grok/agent-sdk";
import * as z from "zod/v4";

import { comandoAgendamentos, listarAgendamentos, processarAgendamentos } from "../lib/agenda.js";
import { aceitarTermos, decidirTermos, lerConta, operarConta, TEXTO_RECUSA } from "../lib/banco.js";
import { responderLocal } from "../lib/conversa/index.js";
import { pngCopiaECola } from "../lib/qr.js";
import {
  RESPOSTA_AJUDA,
  RESPOSTA_COMPROVANTE,
  RESPOSTA_DEPOSITO_PENDENTE,
  RESPOSTA_SEM_CONTA,
  respostaContaAberta,
  respostaSaldo,
} from "../lib/respostas.js";
import {
  type Atualizacao,
  type EstadoTelegram,
  AVISO_FALHA,
  RESPOSTA_SEM_TEXTO,
  chaveEntrega,
  chaveUpdate,
  configurarPerfil,
  enviarFoto,
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
  if (atualizacao.tipo === "comprovante") {
    const local = await responderLocal(
      deps.kv,
      atualizacao.chatId,
      "segue o comprovante do pix",
      atualizacao.nome,
      (await lerConta(deps.kv, atualizacao.chatId)) !== undefined,
      false,
      `comp:${atualizacao.updateId}`,
    );
    const texto = local.tipo === "modelo" ? RESPOSTA_COMPROVANTE : local.texto;
    const ok = await enviarTexto(atualizacao.chatId, texto, atualizacao.mensagemId);
    if (ok) {
      await registrarTroca(deps.kv, atualizacao.chatId, atualizacao.nome, "[comprovante]", texto, "padrao");
    }
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
  if (await atalhoCarteira(deps, atualizacao, existente !== undefined)) return;
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
  const memoria = await lerMemoria(deps.kv, atualizacao.chatId);
  const local = await responderLocal(
    deps.kv,
    atualizacao.chatId,
    atualizacao.texto,
    atualizacao.nome,
    existente !== undefined,
    memoria.historico.length === 0,
    `fala:${atualizacao.updateId}`,
  );
  if (local.tipo === "modelo") {
    await falar(deps, atualizacao, atualizacao.texto, false);
    return;
  }
  if (local.tipo === "deposito") {
    const foto = await enviarFoto(atualizacao.chatId, await pngCopiaECola(local.copiaECola), local.texto);
    if (!foto) await enviarTexto(atualizacao.chatId, local.texto, atualizacao.mensagemId);
    await registrarTroca(deps.kv, atualizacao.chatId, atualizacao.nome, atualizacao.texto, local.texto, "padrao");
    return;
  }
  await enviarPadrao(deps.kv, atualizacao, local.texto);
}

function comando(texto: string, nome: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return limpo === `/${nome}` || limpo.startsWith(`/${nome}@`) || limpo.startsWith(`/${nome} `);
}

function valorDoComando(texto: string): string | undefined {
  const limpo = texto.trim().replace(/^\/\S+\s*/, "");
  return limpo.length > 0 ? limpo : undefined;
}

async function atalhoCarteira(
  deps: Despacho,
  atualizacao: Extract<MensagemRecebida, { tipo: "texto" }>,
  temConta: boolean,
): Promise<boolean> {
  const saldo = comando(atualizacao.texto, "saldo");
  const extrato = comando(atualizacao.texto, "extrato");
  const depositar = comando(atualizacao.texto, "depositar");
  if (!saldo && !extrato && !depositar) return false;
  if (!temConta) {
    await enviarTexto(atualizacao.chatId, RESPOSTA_SEM_CONTA, atualizacao.mensagemId);
    return true;
  }
  if (saldo) {
    const local = await responderLocal(
      deps.kv,
      atualizacao.chatId,
      "qual é o meu saldo",
      atualizacao.nome,
      true,
      false,
      `saldo:${atualizacao.updateId}`,
    );
    if (local.tipo === "texto") await enviarPadrao(deps.kv, atualizacao, local.texto);
    else {
      const resumo = await operarConta(deps.kv, atualizacao.chatId, `saldo:${atualizacao.updateId}`, { acao: "resumo" });
      await enviarPadrao(deps.kv, atualizacao, respostaSaldo(resumo.saldo ?? "0,00"));
    }
    return true;
  }
  if (extrato) {
    const local = await responderLocal(
      deps.kv,
      atualizacao.chatId,
      "quero o extrato",
      atualizacao.nome,
      true,
      false,
      `extrato:${atualizacao.updateId}`,
    );
    if (local.tipo === "texto") await enviarPadrao(deps.kv, atualizacao, local.texto);
    else {
      const lista = await operarConta(deps.kv, atualizacao.chatId, `extrato:${atualizacao.updateId}`, { acao: "extrato" });
      const linhas = (lista.extrato ?? []).map((item) => `${item.em}: ${item.tipo} R$ ${item.valor} ${item.descricao}`);
      const texto =
        linhas.length === 0
          ? `Saldo: R$ ${lista.saldo ?? "0,00"}. Ainda não há movimentação. Quer depositar?`
          : `Saldo: R$ ${lista.saldo ?? "0,00"}. ${linhas.join(" ")}`;
      await enviarPadrao(deps.kv, atualizacao, texto);
    }
    return true;
  }
  const valor = valorDoComando(atualizacao.texto);
  if (valor === undefined) {
    await enviarPadrao(deps.kv, atualizacao, "Qual valor você quer depositar?");
    return true;
  }
  const deposito = await operarConta(deps.kv, atualizacao.chatId, `deposito:${atualizacao.updateId}:${valor}`, {
    acao: "depositar",
    valor,
  });
  if (!deposito.ok || deposito.copiaECola === undefined) {
    await enviarPadrao(deps.kv, atualizacao, RESPOSTA_DEPOSITO_PENDENTE);
    return true;
  }
  const caption = `Depósito de R$ ${deposito.valor}. Pague este PIX. O saldo só entra depois da confirmação. Código copia e cola:\n${deposito.copiaECola}`;
  const png = await pngCopiaECola(deposito.copiaECola);
  const foto = await enviarFoto(atualizacao.chatId, png, caption);
  if (!foto) await enviarTexto(atualizacao.chatId, caption, atualizacao.mensagemId);
  await registrarTroca(deps.kv, atualizacao.chatId, atualizacao.nome, atualizacao.texto, caption, "padrao");
  return true;
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
