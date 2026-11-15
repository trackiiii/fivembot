import type { HostKvApi } from "@grok/agent-sdk";

import { enviarTexto, responderCallback } from "./atendimento.js";
import { emManutencao, garantirConfig } from "./config.js";
import { ehAdmin } from "./modo.js";
import { RESPOSTA_MANUTENCAO } from "./respostas.js";

export { emManutencao, RESPOSTA_MANUTENCAO };

export async function responderManutencao(
  kv: HostKvApi,
  pedido: { chatId: string; mensagemId?: number; callbackId?: string },
): Promise<boolean> {
  await garantirConfig(kv);
  if (!emManutencao()) return false;
  if (ehAdmin(pedido.chatId)) return false;
  if (pedido.callbackId !== undefined) await responderCallback(pedido.callbackId, "Manutenção");
  await enviarTexto(pedido.chatId, RESPOSTA_MANUTENCAO, {
    prefixo: false,
    ...(pedido.mensagemId !== undefined && pedido.mensagemId > 0 ? { replyTo: pedido.mensagemId } : {}),
  });
  return true;
}
