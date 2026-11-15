import { createHash, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { HostKvApi, JsonObject, JsonValue } from "@grok/agent-sdk";
import * as z from "zod/v4";

import { TEXTO_TERMOS, type ResumoConta } from "./banco.js";
import { configAtual } from "./config.js";
import { sintetizarVoz } from "./voz.js";

carregarEnvLocal();

function carregarEnvLocal(): void {
  let texto: string;
  try {
    texto = readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8");
  } catch {
    return;
  }
  for (const linha of texto.split("\n")) {
    const limpa = linha.trim();
    if (limpa.length === 0 || limpa.startsWith("#")) continue;
    const igual = limpa.indexOf("=");
    if (igual <= 0) continue;
    const chave = limpa.slice(0, igual).trim();
    if (!/^(?:TELEGRAM|PIX_GATEWAY|PIX_TAXA|PIX_RECEBIMENTO|LINHABANK|ADMIN|ASAAS|LBCOINS)_[A-Z0-9_]+$/.test(chave)) continue;
    if (process.env[chave] !== undefined && process.env[chave] !== "") continue;
    let valor = limpa.slice(igual + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    process.env[chave] = valor;
  }
}

const LIMITE_TEXTO = 500;
const LIMITE_HISTORICO = 12;
const LIMITE_PROTOCOLOS = 10;
const LIMITE_MENSAGEM = 2000;
const LIMITE_TELEGRAM = 4000;

export type Papel = "cliente" | "thialinha";

export type MemoriaChat = {
  nome: string;
  historico: { papel: Papel; texto: string }[];
  protocolos: { protocolo: string; assunto: string; resumo: string }[];
};

export type EstadoTelegram = {
  chatId: string;
  updateId: number;
  mensagemId: number;
  textoCliente: string;
  nome: string;
};

export type Atualizacao =
  | { tipo: "ignorar" }
  | { tipo: "sem_texto"; chatId: string; mensagemId: number; nome: string; updateId: number }
  | {
      tipo: "comprovante";
      chatId: string;
      mensagemId: number;
      nome: string;
      updateId: number;
      fotoId?: string;
      caption?: string;
    }
  | {
      tipo: "texto";
      chatId: string;
      mensagemId: number;
      nome: string;
      texto: string;
      updateId: number;
    }
  | {
      tipo: "callback";
      chatId: string;
      mensagemId: number;
      nome: string;
      updateId: number;
      callbackId: string;
      dados: string;
      decisao: "concordo" | "recuso" | "admin" | "clube" | "cofrinho" | "ignorar";
    };

export type TecladoInline = { text: string; callback_data: string }[][];

export type OpcoesEnvio = {
  replyTo?: number;
  prefixo?: boolean;
  teclado?: TecladoInline;
  editar?: number;
};

const mensagemSchema = z.object({
  message_id: z.number().int(),
  text: z.string().optional(),
  caption: z.string().optional(),
  photo: z
    .array(
      z.object({
        file_id: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    )
    .optional(),
  document: z
    .object({
      file_id: z.string(),
      mime_type: z.string().optional(),
    })
    .optional(),
  from: z
    .object({
      first_name: z.string().optional(),
      is_bot: z.boolean().optional(),
    })
    .optional(),
  chat: z.object({
    id: z.number().int(),
    type: z.string(),
  }),
});

function fotoIdDaMensagem(mensagem: {
  photo?: { file_id: string; width?: number }[];
  document?: { file_id: string; mime_type?: string };
}): string | undefined {
  if (mensagem.photo !== undefined && mensagem.photo.length > 0) {
    const maior = mensagem.photo.reduce((atual, item) =>
      (item.width ?? 0) >= (atual.width ?? 0) ? item : atual,
    );
    return maior.file_id.length > 0 ? maior.file_id : undefined;
  }
  const mime = mensagem.document?.mime_type ?? "";
  if (mensagem.document !== undefined && /^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) {
    return mensagem.document.file_id.length > 0 ? mensagem.document.file_id : undefined;
  }
  return undefined;
}

const atualizacaoSchema = z.object({
  update_id: z.number().int(),
  message: mensagemSchema.optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      from: z
        .object({
          first_name: z.string().optional(),
          is_bot: z.boolean().optional(),
        })
        .optional(),
      message: z
        .object({
          message_id: z.number().int(),
          chat: z.object({
            id: z.number().int(),
            type: z.string(),
          }),
        })
        .optional(),
    })
    .optional(),
});

export function memoriaVazia(): MemoriaChat {
  return { nome: "cliente", historico: [], protocolos: [] };
}

export function chaveChat(chatId: string): string {
  return `linhabank:chat:${chatId}`;
}

export function chaveUpdate(updateId: number): string {
  return `linhabank:update:${updateId}`;
}

export function chaveEntrega(chatId: string, updateId: number): string {
  return `linhabank:entrega:${chatId}:${updateId}`;
}

export function chaveProtocolosDaSessao(sessionId: string): string {
  return `linhabank:sess-protocolos:${sessionId}`;
}

export function chaveProtocolo(id: string): string {
  return `linhabank:protocolo:${id}`;
}

export function chaveIdempotencia(sessionId: string, assunto: string, resumo: string): string {
  const digest = createHash("sha256").update(`${assunto}\n${resumo}`).digest("hex").slice(0, 16);
  return `linhabank:proto-sess:${sessionId}:${digest}`;
}

export function novoProtocolo(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let corpo = "";
  for (let i = 0; i < 6; i += 1) {
    corpo += alfabeto[randomInt(alfabeto.length)];
  }
  return `LB-${corpo}`;
}

export function cortar(texto: string, limite = LIMITE_TEXTO): string {
  const limpo = texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

export function nomeSeguro(valor: string | undefined): string {
  const nome = cortar(valor ?? "", 40);
  return nome.length > 0 ? nome : "cliente";
}

export function interpretarAtualizacao(corpo: unknown): Atualizacao {
  const lido = atualizacaoSchema.safeParse(corpo);
  if (!lido.success) return { tipo: "ignorar" };
  const callback = lido.data.callback_query;
  if (callback !== undefined) {
    if (callback.from?.is_bot === true) return { tipo: "ignorar" };
    const chat = callback.message?.chat;
    if (chat !== undefined && chat.type !== "private") return { tipo: "ignorar" };
    if (chat === undefined) return { tipo: "ignorar" };
    const data = callback.data ?? "";
    const decisao =
      data === "termos:concordo"
        ? "concordo"
        : data === "termos:recuso"
          ? "recuso"
          : data.startsWith("a:")
            ? "admin"
            : data.startsWith("c:")
              ? "clube"
              : data.startsWith("k:")
                ? "cofrinho"
                : "ignorar";
    return {
      tipo: "callback",
      chatId: String(chat.id),
      mensagemId: callback.message?.message_id ?? 0,
      nome: nomeSeguro(callback.from?.first_name),
      updateId: lido.data.update_id,
      callbackId: callback.id,
      dados: data.slice(0, 64),
      decisao,
    };
  }
  if (lido.data.message === undefined) return { tipo: "ignorar" };
  const mensagem = lido.data.message;
  if (mensagem.chat.type !== "private" || mensagem.from?.is_bot === true) {
    return { tipo: "ignorar" };
  }
  const base = {
    chatId: String(mensagem.chat.id),
    mensagemId: mensagem.message_id,
    nome: nomeSeguro(mensagem.from?.first_name),
    updateId: lido.data.update_id,
  };
  const caption = cortar(mensagem.caption ?? "", LIMITE_MENSAGEM);
  const texto = cortar(mensagem.text ?? mensagem.caption ?? "", LIMITE_MENSAGEM);
  if ((mensagem.photo !== undefined && mensagem.photo.length > 0) || mensagem.document !== undefined) {
    const fotoId = fotoIdDaMensagem(mensagem);
    return {
      tipo: "comprovante",
      ...base,
      ...(fotoId !== undefined ? { fotoId } : {}),
      ...(caption.length > 0 ? { caption } : {}),
    };
  }
  if (texto.length === 0) return { tipo: "sem_texto", ...base };
  return { tipo: "texto", ...base, texto };
}

export function montarEntrada(mensagem: string, memoria: MemoriaChat, conta: ResumoConta): string {
  return JSON.stringify({
    mensagem,
    contexto: {
      nome: memoria.nome,
      historico: memoria.historico,
      protocolos: memoria.protocolos,
      conta,
    },
  });
}

function listaDeTexto(valor: JsonValue | undefined): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}

function comoObjeto(valor: JsonValue | undefined): JsonObject | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    return undefined;
  }
  return valor;
}

export async function lerMemoria(kv: HostKvApi, chatId: string): Promise<MemoriaChat> {
  const bruto = comoObjeto(await kv.get(chaveChat(chatId)));
  if (bruto === undefined) return memoriaVazia();
  const nome = typeof bruto.nome === "string" ? nomeSeguro(bruto.nome) : "cliente";
  const historicoBruto = Array.isArray(bruto.historico) ? bruto.historico : [];
  const historico: MemoriaChat["historico"] = [];
  for (const item of historicoBruto) {
    const linha = comoObjeto(item);
    if (linha === undefined) continue;
    if ((linha.papel !== "cliente" && linha.papel !== "thialinha") || typeof linha.texto !== "string") {
      continue;
    }
    historico.push({ papel: linha.papel, texto: cortar(linha.texto) });
  }
  const protocolosBrutos = Array.isArray(bruto.protocolos) ? bruto.protocolos : [];
  const protocolos: MemoriaChat["protocolos"] = [];
  for (const item of protocolosBrutos) {
    const linha = comoObjeto(item);
    if (linha === undefined) continue;
    if (
      typeof linha.protocolo !== "string" ||
      typeof linha.assunto !== "string" ||
      typeof linha.resumo !== "string"
    ) {
      continue;
    }
    protocolos.push({
      protocolo: linha.protocolo,
      assunto: linha.assunto,
      resumo: cortar(linha.resumo, 280),
    });
  }
  return {
    nome,
    historico: historico.slice(-LIMITE_HISTORICO),
    protocolos: protocolos.slice(-LIMITE_PROTOCOLOS),
  };
}

export async function gravarMemoria(kv: HostKvApi, chatId: string, memoria: MemoriaChat): Promise<void> {
  await kv.put(chaveChat(chatId), {
    nome: memoria.nome,
    historico: memoria.historico.slice(-LIMITE_HISTORICO),
    protocolos: memoria.protocolos.slice(-LIMITE_PROTOCOLOS),
  });
}

export async function registrarTroca(
  kv: HostKvApi,
  chatId: string,
  nome: string,
  textoCliente: string,
  textoThialinha: string,
  sessionId: string,
): Promise<void> {
  const memoria = await lerMemoria(kv, chatId);
  memoria.nome = nomeSeguro(nome);
  const cliente = cortar(textoCliente);
  const resposta = cortar(textoThialinha);
  const tamanho = memoria.historico.length;
  const anteriorCliente = tamanho >= 2 ? memoria.historico[tamanho - 2] : undefined;
  const anteriorResposta = tamanho >= 1 ? memoria.historico[tamanho - 1] : undefined;
  const repetida =
    anteriorCliente?.papel === "cliente" &&
    anteriorCliente.texto === cliente &&
    anteriorResposta?.papel === "thialinha" &&
    anteriorResposta.texto === resposta;
  if (!repetida && cliente.length > 0 && resposta.length > 0) {
    memoria.historico.push({ papel: "cliente", texto: cliente }, { papel: "thialinha", texto: resposta });
  }
  const ids = listaDeTexto(await kv.get(chaveProtocolosDaSessao(sessionId)));
  for (const id of ids) {
    if (memoria.protocolos.some((item) => item.protocolo === id)) continue;
    const registro = comoObjeto(await kv.get(chaveProtocolo(id)));
    if (registro === undefined) continue;
    if (
      registro.aberto !== true ||
      typeof registro.protocolo !== "string" ||
      typeof registro.assunto !== "string" ||
      typeof registro.resumo !== "string"
    ) {
      continue;
    }
    memoria.protocolos.push({
      protocolo: registro.protocolo,
      assunto: registro.assunto,
      resumo: cortar(registro.resumo, 280),
    });
  }
  await gravarMemoria(kv, chatId, memoria);
}

export const PREFIXO_THIALINHA = "Thialinha:";
const PREFIXO_THIALINHA_HTML = "<b>Thialinha</b>:";

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function destacarNomeThialinha(texto: string): string {
  return texto.replace(/\bThialinha\b/gi, "<b>Thialinha</b>");
}

export function comVozThialinha(texto: string): string {
  const limpo = texto.replace(/^\uFEFF/, "").trim();
  const semPrefixo = limpo.replace(/^thialinha\s*:\s*/i, "");
  const corpo = destacarNomeThialinha(escaparHtml(semPrefixo));
  if (!configAtual().prefixoThialinha) return corpo;
  if (corpo.length === 0) return PREFIXO_THIALINHA_HTML;
  return `${PREFIXO_THIALINHA_HTML} ${corpo}`;
}

function comParseHtml(texto: string, html: boolean): { text: string; parse_mode?: "HTML" } {
  return html ? { text: texto, parse_mode: "HTML" } : { text: texto };
}

function pedacos(texto: string): string[] {
  if (texto.length <= LIMITE_TELEGRAM) return [texto];
  const saida: string[] = [];
  let resto = texto;
  while (resto.length > LIMITE_TELEGRAM) {
    const quebra = resto.lastIndexOf("\n", LIMITE_TELEGRAM);
    const fim = quebra > 200 ? quebra : LIMITE_TELEGRAM;
    saida.push(resto.slice(0, fim));
    resto = resto.slice(fim).replace(/^\n/, "");
  }
  if (resto.length > 0) saida.push(resto);
  return saida;
}

type RespostaTelegram = {
  ok: boolean;
  description?: string;
  result?: { message_id?: number };
};

async function postTelegram(metodo: string, corpo: Record<string, unknown>): Promise<RespostaTelegram> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.length === 0) return { ok: false };
  try {
    const resposta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const corpoResposta = (await resposta.json().catch(() => null)) as RespostaTelegram | null;
    if (corpoResposta === null) return { ok: false };
    return corpoResposta;
  } catch {
    return { ok: false };
  }
}

async function chamarTelegram(metodo: string, corpo: Record<string, unknown>): Promise<boolean> {
  const resposta = await postTelegram(metodo, corpo);
  return resposta.ok === true;
}

export async function enviarFotoId(
  chatId: string,
  fileId: string,
  caption?: string,
  opcoes: { prefixo?: boolean } = {},
): Promise<boolean> {
  const prefixo = opcoes.prefixo !== false;
  const corpo: Record<string, unknown> = {
    chat_id: chatId,
    photo: fileId,
  };
  const bruto = (caption ?? "").trim();
  if (bruto.length > 0) {
    const texto = (prefixo ? comVozThialinha(bruto) : bruto).slice(0, 1024);
    const formatado = comParseHtml(texto, prefixo);
    corpo.caption = formatado.text;
    if (formatado.parse_mode !== undefined) corpo.parse_mode = formatado.parse_mode;
  }
  const resposta = await postTelegram("sendPhoto", corpo);
  return resposta.ok === true;
}

async function enviarVoz(
  chatId: string,
  ogg: Uint8Array,
  caption: string,
  replyTo?: number,
): Promise<{ ok: boolean; mensagemId?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.length === 0) return { ok: false };
  try {
    const form = new FormData();
    form.set("chat_id", chatId);
    const captionHtml = comParseHtml(caption.slice(0, 1024), true);
    form.set("caption", captionHtml.text);
    if (captionHtml.parse_mode !== undefined) form.set("parse_mode", captionHtml.parse_mode);
    if (replyTo !== undefined) form.set("reply_parameters", JSON.stringify({ message_id: replyTo }));
    form.set("voice", new Blob([Buffer.from(ogg)], { type: "audio/ogg" }), "thialinha.ogg");
    const resposta = await fetch(`https://api.telegram.org/bot${token}/sendVoice`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    const corpo = (await resposta.json().catch(() => null)) as RespostaTelegram | null;
    if (!resposta.ok || corpo?.ok !== true) return { ok: false };
    return { ok: true, mensagemId: corpo.result?.message_id };
  } catch {
    return { ok: false };
  }
}

export async function enviarFoto(chatId: string, png: Uint8Array, caption: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.length === 0) return false;
  try {
    const form = new FormData();
    form.set("chat_id", chatId);
    const captionHtml = comParseHtml(comVozThialinha(caption).slice(0, 1024), true);
    form.set("caption", captionHtml.text);
    if (captionHtml.parse_mode !== undefined) form.set("parse_mode", captionHtml.parse_mode);
    form.set("photo", new Blob([Buffer.from(png)], { type: "image/png" }), "pix.png");
    const resposta = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const corpo = (await resposta.json().catch(() => null)) as { ok?: boolean } | null;
    return resposta.ok && corpo?.ok === true;
  } catch {
    return false;
  }
}

function opcoesDeEnvio(valor: number | OpcoesEnvio | undefined): OpcoesEnvio {
  if (valor === undefined) return {};
  if (typeof valor === "number") return { replyTo: valor };
  return valor;
}

function textoParaEnvio(texto: string, prefixo: boolean): string {
  return prefixo ? comVozThialinha(texto) : texto.replace(/^\uFEFF/, "").trim();
}

export async function enviarTexto(
  chatId: string,
  texto: string,
  mensagemIdOuOpcoes?: number | OpcoesEnvio,
): Promise<boolean> {
  return (await enviarMensagem(chatId, texto, opcoesDeEnvio(mensagemIdOuOpcoes))).ok;
}

export async function enviarMensagem(
  chatId: string,
  texto: string,
  opcoes: OpcoesEnvio = {},
): Promise<{ ok: boolean; mensagemId?: number }> {
  const prefixo = opcoes.prefixo !== false;
  if (
    prefixo &&
    opcoes.editar === undefined &&
    opcoes.teclado === undefined &&
    configAtual().vozThialinha
  ) {
    const gravando = chamarTelegram("sendChatAction", { chat_id: chatId, action: "record_voice" });
    const audio = await sintetizarVoz(texto);
    await gravando;
    if (audio !== undefined) {
      const voz = await enviarVoz(chatId, audio, textoParaEnvio(texto, prefixo), opcoes.replyTo);
      if (voz.ok) return voz;
    }
  }
  const partes = pedacos(textoParaEnvio(texto, prefixo)).map((parte) => comParseHtml(parte, prefixo));
  if (opcoes.editar !== undefined && opcoes.editar > 0) {
    const primeira = partes[0] ?? { text: "" };
    const corpo: Record<string, unknown> = {
      chat_id: chatId,
      message_id: opcoes.editar,
      text: primeira.text,
    };
    if (primeira.parse_mode !== undefined) corpo.parse_mode = primeira.parse_mode;
    if (opcoes.teclado !== undefined) corpo.reply_markup = { inline_keyboard: opcoes.teclado };
    const resposta = await postTelegram("editMessageText", corpo);
    if (resposta.ok) return { ok: true, mensagemId: opcoes.editar };
    if ((resposta.description ?? "").includes("message is not modified")) {
      return { ok: true, mensagemId: opcoes.editar };
    }
    return { ok: false };
  }
  let mensagemId: number | undefined;
  for (let i = 0; i < partes.length; i += 1) {
    const parte = partes[i] ?? { text: "" };
    const corpo: Record<string, unknown> = {
      chat_id: chatId,
      text: parte.text,
    };
    if (parte.parse_mode !== undefined) corpo.parse_mode = parte.parse_mode;
    if (i === 0 && opcoes.replyTo !== undefined) {
      corpo.reply_parameters = { message_id: opcoes.replyTo };
    }
    if (i === 0 && opcoes.teclado !== undefined) {
      corpo.reply_markup = { inline_keyboard: opcoes.teclado };
    }
    const resposta = await postTelegram("sendMessage", corpo);
    if (!resposta.ok) return { ok: false, mensagemId };
    if (i === 0) mensagemId = resposta.result?.message_id;
  }
  return { ok: true, mensagemId };
}

export async function mostrarDigitando(chatId: string): Promise<void> {
  await chamarTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
}

const COMANDOS_CLIENTE = [
  { command: "start", description: "Começar, ou ver saldo e o movimento de hoje" },
  { command: "ajuda", description: "Ver como a Thialinha pode ajudar" },
  { command: "agendamentos", description: "Ver os PIX agendados" },
  { command: "saldo", description: "Ver o saldo da conta" },
  { command: "extrato", description: "Ver o histórico da conta" },
  { command: "depositar", description: "Gerar QR Code para depósito PIX" },
  { command: "club", description: "Abrir o LINHABANK CLUB" },
  { command: "cofrinho", description: "Guardar e resgatar no cofrinho" },
];

export async function configurarPerfil(): Promise<boolean> {
  const comandos = COMANDOS_CLIENTE;
  const nome = await chamarTelegram("setMyName", { name: configAtual().nomeExibido.slice(0, 32) });
  if (!nome) return false;
  await chamarTelegram("setMyShortDescription", {
    short_description: "Thialinha, atendimento do LinhaBank",
  });
  await chamarTelegram("setMyDescription", {
    description:
      "A Thialinha cuida da sua conta no LinhaBank neste chat: saldo, PIX, cofrinho, agendamento e o Club. O app abre no botão LinhaBank ao lado da mensagem.",
  });
  await chamarTelegram("setMyCommands", { commands: comandos });
  await configurarMenuApp();
  return true;
}

export async function configurarComandosAdmin(chatId: string): Promise<boolean> {
  const id = Number(chatId);
  if (!Number.isSafeInteger(id)) return false;
  return chamarTelegram("setMyCommands", {
    commands: [...COMANDOS_CLIENTE, { command: "admin", description: "Gerência LinhaBank" }],
    scope: { type: "chat", chat_id: id },
  });
}

export function urlDoMiniApp(): string | undefined {
  const cfg = configAtual();
  if (!cfg.botaoMiniApp) return undefined;
  const bruto = cfg.webappUrl.trim();
  if (bruto.length === 0) return undefined;
  if (!/^https:\/\//i.test(bruto)) return undefined;
  return bruto.replace(/\/$/, "");
}

export async function configurarMenuApp(): Promise<boolean> {
  const url = urlDoMiniApp();
  if (url === undefined) {
    return chamarTelegram("setChatMenuButton", { menu_button: { type: "commands" } });
  }
  return chamarTelegram("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "LinhaBank",
      web_app: { url },
    },
  });
}

export function idDaAtualizacao(corpo: unknown): number | undefined {
  if (corpo === null || typeof corpo !== "object" || !("update_id" in corpo)) return undefined;
  const id = corpo.update_id;
  return typeof id === "number" && Number.isInteger(id) && id >= 0 ? id : undefined;
}

export async function lerOffset(kv: HostKvApi): Promise<number> {
  const valor = await kv.get("linhabank:poll-offset");
  return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 ? valor : 0;
}

export async function gravarOffset(kv: HostKvApi, offset: number): Promise<void> {
  await kv.put("linhabank:poll-offset", offset);
}

export async function soltarWebhook(): Promise<boolean> {
  return chamarTelegram("deleteWebhook", { drop_pending_updates: false });
}

export async function lerAtualizacoes(
  offset: number,
): Promise<{ ok: true; itens: unknown[] } | { ok: false; codigo: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.length === 0) return { ok: false, codigo: 0 };
  try {
    const resposta = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"],
      }),
      signal: AbortSignal.timeout(35_000),
    });
    const json = (await resposta.json().catch(() => null)) as { ok?: boolean; result?: unknown } | null;
    if (!resposta.ok || json?.ok !== true || !Array.isArray(json.result)) {
      return { ok: false, codigo: resposta.status };
    }
    return { ok: true, itens: json.result };
  } catch {
    return { ok: false, codigo: 0 };
  }
}

export const RESPOSTA_SEM_TEXTO =
  "Eu falo por áudio, mas leio o que você escreve. Manda saldo, PIX ou depósito por texto.";

export const AVISO_FALHA =
  "Travou daqui. Manda de novo daqui a pouco que eu te cubro.";

export async function enviarTermos(chatId: string, mensagemId?: number): Promise<boolean> {
  const termos = comParseHtml(comVozThialinha(TEXTO_TERMOS), true);
  const corpo: Record<string, unknown> = {
    chat_id: chatId,
    text: termos.text,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Concordo", callback_data: "termos:concordo" },
          { text: "Não concordo", callback_data: "termos:recuso" },
        ],
      ],
    },
  };
  if (termos.parse_mode !== undefined) corpo.parse_mode = termos.parse_mode;
  if (mensagemId !== undefined && mensagemId > 0) corpo.reply_parameters = { message_id: mensagemId };
  return chamarTelegram("sendMessage", corpo);
}

export async function responderCallback(callbackId: string, texto?: string): Promise<void> {
  const corpo: Record<string, unknown> = { callback_query_id: callbackId };
  if (texto !== undefined && texto.length > 0) corpo.text = texto.slice(0, 180);
  await chamarTelegram("answerCallbackQuery", corpo);
}
