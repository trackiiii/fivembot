import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import type { Categoria, EstadoFala } from "./tipos.js";

function chave(chatId: string): string {
  return `linhabank:fala:${chatId}`;
}

function comoObjeto(valor: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

export async function lerEstadoFala(kv: HostKvApi, chatId: string): Promise<EstadoFala> {
  const item = comoObjeto(await kv.get(chave(chatId)));
  if (item === undefined) return {};
  const pendente = item.pendente === "valor_deposito" || item.pendente === "ajuda" ? item.pendente : undefined;
  return {
    ultimaId: typeof item.ultimaId === "string" ? item.ultimaId : undefined,
    ultimaCategoria: typeof item.ultimaCategoria === "string" ? (item.ultimaCategoria as Categoria) : undefined,
    pendente,
  };
}

export async function gravarEstadoFala(kv: HostKvApi, chatId: string, estado: EstadoFala): Promise<void> {
  await kv.put(chave(chatId), {
    ultimaId: estado.ultimaId ?? "",
    ultimaCategoria: estado.ultimaCategoria ?? "",
    pendente: estado.pendente ?? "",
  });
}
