import { createHash, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { HostKvApi, JsonObject, JsonValue } from "@grok/agent-sdk";
import * as z from "zod/v4";

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
    if (!/^TELEGRAM_[A-Z0-9_]+$/.test(chave)) continue;
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
      tipo: "texto";
      chatId: string;
      mensagemId: number;
      nome: string;
      texto: string;
      updateId: number;
    };

const mensagemSchema = z.object({
  message_id: z.number().int(),
  text: z.string().optional(),
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

const atualizacaoSchema = z.object({
  update_id: z.number().int(),
  message: mensagemSchema.optional(),
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
  if (!lido.success || lido.data.message === undefined) return { tipo: "ignorar" };
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
  const texto = cortar(mensagem.text ?? "", LIMITE_MENSAGEM);
  if (texto.length === 0) return { tipo: "sem_texto", ...base };
  return { tipo: "texto", ...base, texto };
}

export function montarEntrada(mensagem: string, memoria: MemoriaChat): string {
  return JSON.stringify({
    mensagem,
    contexto: {
      nome: memoria.nome,
      historico: memoria.historico,
      protocolos: memoria.protocolos,
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

async function chamarTelegram(metodo: string, corpo: Record<string, unknown>): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token === undefined || token.length === 0) return false;
  try {
    const resposta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const corpoResposta = (await resposta.json().catch(() => null)) as { ok?: boolean } | null;
    return resposta.ok && corpoResposta?.ok === true;
  } catch {
    return false;
  }
}

export async function enviarTexto(
  chatId: string,
  texto: string,
  mensagemId?: number,
): Promise<boolean> {
  const partes = pedacos(texto);
  for (let i = 0; i < partes.length; i += 1) {
    const corpo: Record<string, unknown> = {
      chat_id: chatId,
      text: partes[i],
    };
    if (i === 0 && mensagemId !== undefined) {
      corpo.reply_parameters = { message_id: mensagemId };
    }
    const ok = await chamarTelegram("sendMessage", corpo);
    if (!ok) return false;
  }
  return true;
}

export async function mostrarDigitando(chatId: string): Promise<void> {
  await chamarTelegram("sendChatAction", { chat_id: chatId, action: "typing" });
}

export async function configurarPerfil(): Promise<boolean> {
  const comandos = [
    { command: "start", description: "Começar o atendimento com a Thialinha" },
    { command: "ajuda", description: "Ver como a Thialinha pode ajudar" },
  ];
  const nome = await chamarTelegram("setMyName", { name: "LinhaBank" });
  if (!nome) return false;
  await chamarTelegram("setMyShortDescription", {
    short_description: "Thialinha, atendente IA do LinhaBank",
  });
  await chamarTelegram("setMyDescription", {
    description:
      "A Thialinha atende você no LinhaBank. Ela explica conta, PIX e cartão e abre protocolo. Ela não acessa a sua conta.",
  });
  await chamarTelegram("setMyCommands", { commands: comandos });
  return true;
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
        allowed_updates: ["message"],
      }),
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
  "Consigo ler mensagem de texto. Escreve o que você precisa que eu te ajudo.";

export const AVISO_FALHA =
  "Tive um problema para responder agora. Manda de novo daqui a pouco que eu te ajudo.";
