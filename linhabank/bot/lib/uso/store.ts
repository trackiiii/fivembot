import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import type { ModoUso, PendenteUso } from "./tipos.js";

const CHAVE = (chatId: string) => `linhabank:uso:${chatId}`;
const PENDENTE = (chatId: string) => `linhabank:uso:pendente:${chatId}`;

export async function lerModoUso(kv: HostKvApi, chatId: string): Promise<ModoUso | undefined> {
  const valor = await kv.get(CHAVE(chatId));
  if (valor === "dialogo" || valor === "menu") return valor;
  return undefined;
}

export async function gravarModoUso(kv: HostKvApi, chatId: string, modo: ModoUso): Promise<void> {
  await kv.put(CHAVE(chatId), modo);
}

export async function lerPendenteUso(kv: HostKvApi, chatId: string): Promise<PendenteUso | undefined> {
  const valor = await kv.get(PENDENTE(chatId));
  return comoPendente(valor);
}

export async function gravarPendenteUso(kv: HostKvApi, chatId: string, pendente: PendenteUso): Promise<void> {
  await kv.put(PENDENTE(chatId), pendente);
}

export async function limparPendenteUso(kv: HostKvApi, chatId: string): Promise<void> {
  await kv.delete(PENDENTE(chatId));
}

function comoPendente(valor: JsonValue | undefined): PendenteUso | undefined {
  if (valor === null || valor === undefined || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const etapa = valor.etapa;
  if (etapa === "receber" || etapa === "chave") return { etapa };
  if (etapa === "valor" && typeof valor.chave === "string" && valor.chave.length > 0) {
    return { etapa, chave: valor.chave };
  }
  if (
    etapa === "confirmar" &&
    typeof valor.chave === "string" &&
    valor.chave.length > 0 &&
    typeof valor.valor === "string" &&
    valor.valor.length > 0 &&
    typeof valor.destino === "string" &&
    valor.destino.length > 0
  ) {
    return {
      etapa,
      chave: valor.chave,
      valor: valor.valor,
      destino: valor.destino,
      ...(typeof valor.taxa === "string" ? { taxa: valor.taxa } : {}),
      ...(valor.interno === true ? { interno: true } : {}),
    };
  }
  return undefined;
}
