import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as z from "zod/v4";

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

export type LancamentoGateway = {
  em: string;
  tipo: string;
  valorCentavos: number;
  descricao: string;
};

export type ContaGateway = {
  agencia: string;
  numero: string;
  chavePix: string;
  nome: string;
};

export type RespostaGateway =
  | {
      ok: true;
      saldoCentavos: number;
      extrato?: LancamentoGateway[];
      endToEndId?: string;
    }
  | {
      ok: false;
      motivo: "gateway_pendente" | "gateway_indisponivel" | "saldo_insuficiente" | "destino_invalido" | "recusado";
      saldoCentavos?: number;
    };

const respostaSchema = z.object({
  ok: z.boolean(),
  motivo: z.string().optional(),
  saldoCentavos: z.number().int().optional(),
  endToEndId: z.string().max(80).optional(),
  extrato: z
    .array(
      z.object({
        em: z.string().max(40),
        tipo: z.string().max(40),
        valorCentavos: z.number().int(),
        descricao: z.string().max(80),
      }),
    )
    .max(20)
    .optional(),
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

export function gatewayConfigurada(): boolean {
  const token = process.env.PIX_GATEWAY_TOKEN?.trim() ?? "";
  return urlBase() !== undefined && token.length > 0;
}

function saldoValido(valor: number | undefined): valor is number {
  return valor !== undefined && Number.isSafeInteger(valor) && valor >= 0 && valor <= 100_000_000_000;
}

function motivoConhecido(motivo: string | undefined): RespostaGateway & { ok: false } {
  if (motivo === "saldo_insuficiente" || motivo === "destino_invalido") {
    return { ok: false, motivo };
  }
  return { ok: false, motivo: "recusado" };
}

async function chamar(caminho: string, corpo: Record<string, unknown>): Promise<RespostaGateway> {
  const base = urlBase();
  const token = process.env.PIX_GATEWAY_TOKEN?.trim() ?? "";
  if (base === undefined || token.length === 0) return { ok: false, motivo: "gateway_pendente" };
  try {
    const resposta = await fetch(`${base}${caminho}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo),
    });
    const json = await resposta.json().catch(() => null);
    const lido = respostaSchema.safeParse(json);
    if (!resposta.ok || !lido.success) return { ok: false, motivo: "gateway_indisponivel" };
    const saldo = saldoValido(lido.data.saldoCentavos) ? lido.data.saldoCentavos : undefined;
    if (lido.data.ok) {
      if (saldo === undefined) return { ok: false, motivo: "gateway_indisponivel" };
      return {
        ok: true,
        saldoCentavos: saldo,
        endToEndId: lido.data.endToEndId,
        extrato: lido.data.extrato?.map((item) => ({
          em: item.em,
          tipo: item.tipo,
          valorCentavos: item.valorCentavos,
          descricao: item.descricao,
        })),
      };
    }
    const falha = motivoConhecido(lido.data.motivo);
    if (saldo !== undefined) falha.saldoCentavos = saldo;
    return falha;
  } catch {
    return { ok: false, motivo: "gateway_indisponivel" };
  }
}

export function consultarSaldo(conta: ContaGateway): Promise<RespostaGateway> {
  return chamar("/v1/contas/consultar", {
    conta: conta.numero,
    agencia: conta.agencia,
    chavePix: conta.chavePix,
    nome: conta.nome,
  });
}

export function enviarPixGateway(
  conta: ContaGateway,
  id: string,
  valorCentavos: number,
  chaveDestino: string,
): Promise<RespostaGateway> {
  return chamar("/v1/pix/enviar", {
    id,
    conta: conta.numero,
    agencia: conta.agencia,
    chavePix: conta.chavePix,
    nome: conta.nome,
    valorCentavos,
    chaveDestino,
  });
}

export function transferirGateway(
  origem: ContaGateway,
  destino: ContaGateway,
  id: string,
  valorCentavos: number,
): Promise<RespostaGateway> {
  return chamar("/v1/transferir", {
    id,
    contaOrigem: origem.numero,
    contaDestino: destino.numero,
    valorCentavos,
  });
}

export function pagarBoletoGateway(
  conta: ContaGateway,
  id: string,
  valorCentavos: number,
  descricao: string,
): Promise<RespostaGateway> {
  return chamar("/v1/boleto", {
    id,
    conta: conta.numero,
    agencia: conta.agencia,
    valorCentavos,
    descricao,
  });
}
