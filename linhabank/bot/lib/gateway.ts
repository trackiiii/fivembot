import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as z from "zod/v4";

import { asaasConfigurado } from "./asaas.js";

carregarGatewayLocal();

function carregarGatewayLocal(): void {
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
    if (!/^PIX_GATEWAY_[A-Z0-9_]+$/.test(chave)) continue;
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

export type RespostaEnvio =
  | { ok: true; endToEndId: string }
  | { ok: false; motivo: "gateway_pendente" | "gateway_indisponivel" | "destino_invalido" | "recusado" };

const respostaSchema = z.object({
  ok: z.boolean(),
  motivo: z.string().optional(),
  endToEndId: z.string().min(6).max(80).optional(),
});

function urlBase(): string | undefined {
  const bruto = process.env.PIX_GATEWAY_URL?.trim();
  if (bruto === undefined || bruto.length === 0) return undefined;
  try {
    const url = new URL(bruto);
    if (url.protocol !== "https:") return undefined;
    return bruto.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

export function gatewayHttpConfigurada(): boolean {
  const token = process.env.PIX_GATEWAY_TOKEN?.trim() ?? "";
  return urlBase() !== undefined && token.length > 0;
}

export function gatewayConfigurada(): boolean {
  return asaasConfigurado() || gatewayHttpConfigurada();
}

export async function enviarPixGateway(pedido: {
  id: string;
  referencia: string;
  valorCentavos: number;
  chaveDestino: string;
}): Promise<RespostaEnvio> {
  const base = urlBase();
  const token = process.env.PIX_GATEWAY_TOKEN?.trim() ?? "";
  if (base === undefined || token.length === 0) return { ok: false, motivo: "gateway_pendente" };
  try {
    const resposta = await fetch(`${base}/v1/pix/enviar`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: pedido.id,
        referencia: pedido.referencia,
        valorCentavos: pedido.valorCentavos,
        chaveDestino: pedido.chaveDestino,
      }),
    });
    const json = await resposta.json().catch(() => null);
    const lido = respostaSchema.safeParse(json);
    if (!resposta.ok || !lido.success) return { ok: false, motivo: "gateway_indisponivel" };
    if (lido.data.ok) {
      if (lido.data.endToEndId === undefined) return { ok: false, motivo: "gateway_indisponivel" };
      return { ok: true, endToEndId: lido.data.endToEndId };
    }
    if (lido.data.motivo === "destino_invalido") return { ok: false, motivo: "destino_invalido" };
    return { ok: false, motivo: "recusado" };
  } catch {
    return { ok: false, motivo: "gateway_indisponivel" };
  }
}
