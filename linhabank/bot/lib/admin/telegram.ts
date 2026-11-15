import type { HostKvApi } from "@grok/agent-sdk";

import {
  configurarComandosAdmin,
  configurarMenuApp,
  configurarPerfil,
  enviarMensagem,
  enviarTexto,
  responderCallback,
  type Atualizacao,
} from "../atendimento.js";
import { garantirConfig } from "../config.js";
import { ehAdmin } from "../modo.js";
import {
  abrirTelaInicial,
  aplicarAcao,
  aplicarMidiaAdmin,
  aplicarTextoAdmin,
  gravarUi,
  lerComandoAdmin,
  lerUi,
  tentarAbrirAdmin,
  type TelaAdmin,
} from "./painel.js";

type CallbackAdmin = Extract<Atualizacao, { tipo: "callback" }>;
type TextoAdmin = Extract<Atualizacao, { tipo: "texto" }>;
type MidiaAdmin = Extract<Atualizacao, { tipo: "comprovante" }>;

export async function tratarCallbackAdmin(kv: HostKvApi, atualizacao: CallbackAdmin): Promise<void> {
  await garantirConfig(kv);
  if (!ehAdmin(atualizacao.chatId)) {
    await responderCallback(atualizacao.callbackId, "Acesso restrito à gerência.");
    return;
  }
  const resultado = await aplicarAcao(kv, atualizacao.chatId, atualizacao.dados);
  await responderCallback(atualizacao.callbackId, resultado.aviso);
  const ui = await lerUi(kv, atualizacao.chatId);
  const mensagemId = atualizacao.mensagemId > 0 ? atualizacao.mensagemId : ui.mensagemId;
  const id = await mostrarPainel(atualizacao.chatId, resultado.tela, mensagemId);
  await gravarUi(kv, atualizacao.chatId, { ...ui, mensagemId: id ?? mensagemId });
  if (resultado.atualizarPerfil === true) {
    await configurarPerfil();
    await configurarMenuApp();
    await configurarComandosAdmin(atualizacao.chatId);
  }
  if (resultado.avisoCliente !== undefined) {
    await enviarTexto(resultado.avisoCliente.chatId, resultado.avisoCliente.texto);
  }
  for (const aviso of resultado.avisosCliente ?? []) {
    await enviarTexto(aviso.chatId, aviso.texto);
  }
}

export async function tratarTextoAdmin(kv: HostKvApi, atualizacao: TextoAdmin): Promise<boolean> {
  const comando = lerComandoAdmin(atualizacao.texto);
  if (comando !== undefined) {
    const auth = await tentarAbrirAdmin(kv, atualizacao.chatId, comando.token);
    if (auth === "ok") {
      await configurarComandosAdmin(atualizacao.chatId);
      const tela = await abrirTelaInicial(kv, atualizacao.chatId);
      const id = await mostrarPainel(atualizacao.chatId, tela);
      const ui = await lerUi(kv, atualizacao.chatId);
      await gravarUi(kv, atualizacao.chatId, { ...ui, mensagemId: id });
      return true;
    }
    const texto =
      auth === "pedir_token"
        ? "Acesso à gerência LinhaBank. Envie /admin seguido da chave de acesso."
        : "Acesso restrito à gerência LinhaBank.";
    await enviarTexto(atualizacao.chatId, texto, { prefixo: false, replyTo: atualizacao.mensagemId });
    return true;
  }
  if (!ehAdmin(atualizacao.chatId)) return false;
  const resultado = await aplicarTextoAdmin(kv, atualizacao.chatId, atualizacao.texto);
  if (resultado === undefined) return false;
  const ui = await lerUi(kv, atualizacao.chatId);
  const id = await mostrarPainel(atualizacao.chatId, resultado.tela, ui.mensagemId);
  await gravarUi(kv, atualizacao.chatId, { ...ui, mensagemId: id ?? ui.mensagemId });
  if (resultado.atualizarPerfil === true) {
    await configurarPerfil();
    await configurarMenuApp();
    await configurarComandosAdmin(atualizacao.chatId);
  }
  if (resultado.avisoCliente !== undefined) {
    await enviarTexto(resultado.avisoCliente.chatId, resultado.avisoCliente.texto);
  }
  for (const aviso of resultado.avisosCliente ?? []) {
    await enviarTexto(aviso.chatId, aviso.texto);
  }
  return true;
}

export async function tratarMidiaAdmin(kv: HostKvApi, atualizacao: MidiaAdmin): Promise<boolean> {
  await garantirConfig(kv);
  if (!ehAdmin(atualizacao.chatId)) return false;
  const resultado = await aplicarMidiaAdmin(kv, atualizacao.chatId, {
    fotoId: atualizacao.fotoId,
    caption: atualizacao.caption,
  });
  if (resultado === undefined) return false;
  const ui = await lerUi(kv, atualizacao.chatId);
  const id = await mostrarPainel(atualizacao.chatId, resultado.tela, ui.mensagemId);
  await gravarUi(kv, atualizacao.chatId, { ...ui, mensagemId: id ?? ui.mensagemId });
  return true;
}

export async function tratarSemTextoAdmin(kv: HostKvApi, chatId: string): Promise<boolean> {
  await garantirConfig(kv);
  if (!ehAdmin(chatId)) return false;
  const ui = await lerUi(kv, chatId);
  if (ui.aba !== "anuncio" && ui.aba !== "anunciook") return false;
  await enviarTexto(chatId, "Envie o texto ou uma foto para o comunicado.", { prefixo: false });
  return true;
}

async function mostrarPainel(chatId: string, tela: TelaAdmin, mensagemId?: number): Promise<number | undefined> {
  if (mensagemId !== undefined && mensagemId > 0) {
    const editado = await enviarMensagem(chatId, tela.texto, {
      prefixo: false,
      teclado: tela.teclado,
      editar: mensagemId,
    });
    if (editado.ok) return mensagemId;
  }
  const enviado = await enviarMensagem(chatId, tela.texto, { prefixo: false, teclado: tela.teclado });
  return enviado.mensagemId;
}
