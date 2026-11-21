import type { HostKvApi } from "@grok/agent-sdk";

import { enviarMensagem, responderCallback, type Atualizacao } from "../atendimento.js";
import { RESPOSTA_SEM_CONTA } from "../respostas.js";
import { montarClube, parseAcaoClube } from "./painel.js";

type Callback = Extract<Atualizacao, { tipo: "callback" }>;

export async function tratarCallbackClube(kv: HostKvApi, atualizacao: Callback): Promise<void> {
  const aba = parseAcaoClube(atualizacao.dados);
  if (aba === undefined) {
    await responderCallback(atualizacao.callbackId, "Opção inválida.");
    return;
  }
  const tela = await montarClube(kv, atualizacao.chatId, aba);
  if (tela === undefined) {
    await responderCallback(atualizacao.callbackId, "Abra a conta com /start para entrar no Club.");
    await enviarMensagem(atualizacao.chatId, RESPOSTA_SEM_CONTA);
    return;
  }
  await responderCallback(atualizacao.callbackId);
  const editado = await enviarMensagem(atualizacao.chatId, tela.texto, {
    teclado: tela.teclado,
    editar: atualizacao.mensagemId,
  });
  if (!editado.ok) {
    await enviarMensagem(atualizacao.chatId, tela.texto, { teclado: tela.teclado });
  }
}

export async function abrirClube(kv: HostKvApi, chatId: string, mensagemId?: number): Promise<boolean> {
  const tela = await montarClube(kv, chatId, "home");
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

export function comandoClube(texto: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return (
    limpo === "/club" ||
    limpo.startsWith("/club@") ||
    limpo.startsWith("/club ") ||
    limpo === "/clube" ||
    limpo.startsWith("/clube@") ||
    limpo.startsWith("/clube ")
  );
}
