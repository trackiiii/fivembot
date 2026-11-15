import type { HostKvApi } from "@grok/agent-sdk";

import { enviarMensagem, responderCallback, type Atualizacao } from "../atendimento.js";
import { RESPOSTA_SEM_CONTA } from "../respostas.js";
import { comandoCofrinho, montarCofrinho, parseAcaoCofrinho, telaDepois, type TelaCofrinho } from "./painel.js";
import {
  encerrarPorId,
  limparPendente,
  pedirNome,
  pedirValor,
  resgatarCofrinho,
  seguirPendente,
} from "./servico.js";

type Callback = Extract<Atualizacao, { tipo: "callback" }>;

export { comandoCofrinho };

export async function tratarCallbackCofrinho(kv: HostKvApi, atualizacao: Callback): Promise<void> {
  const acao = parseAcaoCofrinho(atualizacao.dados);
  if (acao === undefined) {
    await responderCallback(atualizacao.callbackId, "Opção inválida.");
    return;
  }
  const telaBase = await montarCofrinho(kv, atualizacao.chatId, { tipo: "home" });
  if (telaBase === undefined) {
    await responderCallback(atualizacao.callbackId, "Abra a conta com /start.");
    await enviarMensagem(atualizacao.chatId, RESPOSTA_SEM_CONTA);
    return;
  }
  await limparPendente(kv, atualizacao.chatId);
  if (acao.tipo === "novo") {
    await pedirNome(kv, atualizacao.chatId);
    await responderCallback(atualizacao.callbackId);
    await enviarTela(atualizacao, {
      texto: "Qual o nome do cofrinho?",
      teclado: [[{ text: "Voltar", callback_data: "k:h" }]],
    });
    return;
  }
  if (acao.tipo === "guardar" || acao.tipo === "resgatar" || acao.tipo === "meta" || acao.tipo === "nome") {
    await pedirValor(kv, atualizacao.chatId, acao.tipo === "nome" ? "renomear" : acao.tipo, acao.id);
    await responderCallback(atualizacao.callbackId);
    const pergunta =
      acao.tipo === "guardar"
        ? "Quanto guardar? Manda em reais, tipo 50 ou 10,50."
        : acao.tipo === "resgatar"
          ? "Quanto resgatar?"
          : acao.tipo === "meta"
            ? "Qual a meta? Manda 0 pra tirar."
            : "Qual o novo nome?";
    await enviarTela(atualizacao, {
      texto: pergunta,
      teclado: [[{ text: "Voltar", callback_data: `k:o:${acao.id}` }]],
    });
    return;
  }
  if (acao.tipo === "tudo") {
    const resultado = await resgatarCofrinho(kv, atualizacao.chatId, acao.id, 0, `krt:${atualizacao.updateId}:${acao.id}`, true);
    await responderCallback(atualizacao.callbackId, resultado.ok ? "Resgatado." : "Não resgatei.");
    const tela = await telaDepois(kv, atualizacao.chatId, acao.id);
    await enviarTela(atualizacao, tela ?? telaBase);
    return;
  }
  if (acao.tipo === "confirmar") {
    const texto = await encerrarPorId(kv, atualizacao.chatId, acao.id);
    await responderCallback(atualizacao.callbackId);
    const tela = await montarCofrinho(kv, atualizacao.chatId, { tipo: "home" });
    await enviarTela(atualizacao, { texto, teclado: tela?.teclado ?? [] });
    return;
  }
  await responderCallback(atualizacao.callbackId);
  const tela = await montarCofrinho(kv, atualizacao.chatId, acao.tipo === "home" ? { tipo: "home" } : acao);
  await enviarTela(atualizacao, tela ?? telaBase);
}

export async function abrirCofrinho(kv: HostKvApi, chatId: string, mensagemId?: number): Promise<boolean> {
  await limparPendente(kv, chatId);
  const tela = await montarCofrinho(kv, chatId, { tipo: "home" });
  if (tela === undefined) {
    await enviarMensagem(chatId, RESPOSTA_SEM_CONTA, mensagemId !== undefined ? { replyTo: mensagemId } : {});
    return false;
  }
  await enviarMensagem(chatId, tela.texto, {
    teclado: tela.teclado,
    ...(mensagemId !== undefined ? { replyTo: mensagemId } : {}),
  });
  return true;
}

export async function tratarTextoCofrinho(
  kv: HostKvApi,
  chatId: string,
  texto: string,
  mensagemId: number,
  idempotencyKey: string,
): Promise<boolean> {
  const seguido = await seguirPendente(kv, chatId, texto, idempotencyKey);
  if (!seguido.tratado) return false;
  const tela = await telaDepois(kv, chatId, seguido.id);
  await enviarMensagem(chatId, seguido.texto, {
    teclado: tela?.teclado,
    replyTo: mensagemId,
  });
  return true;
}

async function enviarTela(atualizacao: Callback, tela: TelaCofrinho): Promise<void> {
  const editado = await enviarMensagem(atualizacao.chatId, tela.texto, {
    teclado: tela.teclado,
    editar: atualizacao.mensagemId,
  });
  if (!editado.ok) await enviarMensagem(atualizacao.chatId, tela.texto, { teclado: tela.teclado });
}
