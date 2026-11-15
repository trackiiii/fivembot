import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as z from "zod/v4";

import { chaveRecebimento } from "./brcode.js";
import type { AvisoPix } from "./banco.js";
import type { RespostaEnvio } from "./gateway.js";
import type { CobrancaPsp, PedidoEnvioPsp } from "./psp.js";

carregarAsaasLocal();

function carregarAsaasLocal(): void {
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
    if (!/^(?:ASAAS|PIX_RECEBIMENTO)_[A-Z0-9_]+$/.test(chave)) continue;
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

export type AmbienteAsaas = "producao" | "sandbox";
export type TipoChaveAsaas = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export type EventoAsaas = {
  id?: string;
  event?: string;
  payment?: {
    id?: string;
    value?: number;
    billingType?: string;
    status?: string;
    description?: string;
    externalReference?: string;
    pixQrCodeId?: string;
    pixTransaction?: {
      endToEndIdentifier?: string;
      txid?: string;
    };
  };
  transfer?: {
    id?: string;
    status?: string;
    failReason?: string;
    endToEndIdentifier?: string;
    value?: number;
    externalReference?: string;
  };
};

const eventoAsaasSchema = z.object({
  id: z.string().max(160).optional(),
  event: z.string().max(80).optional(),
  payment: z
    .object({
      id: z.string().max(80).optional(),
      value: z.number().optional(),
      billingType: z.string().max(40).optional(),
      status: z.string().max(40).optional(),
      description: z.string().max(200).optional(),
      externalReference: z.string().max(100).optional(),
      pixQrCodeId: z.string().max(80).optional(),
      pixTransaction: z
        .object({
          endToEndIdentifier: z.string().max(80).optional(),
          txid: z.string().max(35).optional(),
        })
        .optional(),
    })
    .optional(),
  transfer: z
    .object({
      id: z.string().max(80).optional(),
      status: z.string().max(40).optional(),
      failReason: z.string().max(200).optional(),
      endToEndIdentifier: z.string().max(80).optional(),
      value: z.number().optional(),
      externalReference: z.string().max(100).optional(),
    })
    .optional(),
});

const AGENT = "LinhaBank/1.0";
let chavePixCache: { em: number; chave?: string } | undefined;

export function chaveAsaas(): string {
  return (process.env.ASAAS_API_KEY ?? "").trim();
}

export function asaasConfigurado(): boolean {
  return chaveAsaas().length >= 20;
}

export function ambienteAsaas(): AmbienteAsaas {
  const forcar = process.env.ASAAS_AMBIENTE?.trim().toLowerCase();
  if (forcar === "sandbox") return "sandbox";
  if (forcar === "producao" || forcar === "live") return "producao";
  const chave = chaveAsaas();
  if (/\$aact_hmlg_|_hmlg_|sandbox/i.test(chave)) return "sandbox";
  return "producao";
}

export function urlAsaas(): string {
  return ambienteAsaas() === "sandbox" ? "https://api-sandbox.asaas.com" : "https://api.asaas.com";
}

export function rotuloAsaas(): string {
  if (!asaasConfigurado()) return "";
  return ambienteAsaas() === "sandbox" ? "Asaas (sandbox)" : "Asaas (produção)";
}

export type TaxasPsp = {
  origem: string;
  taxaCentavos: number;
  taxaPercentual: string;
  recebimentoCentavos: number;
  recebimentoPercentual: string;
  envioGratisMes?: number;
  recebimentoGratisMes?: number;
};

export function taxasDeJsonAsaas(json: Record<string, unknown>, origem = "Asaas"): TaxasPsp | undefined {
  const pagamento = objeto(json.payment);
  const transferencia = objeto(json.transfer);
  const pixRecebido = objeto(pagamento?.pix);
  const pixEnvio = objeto(transferencia?.pix);
  if (pixRecebido === undefined && pixEnvio === undefined) return undefined;
  const envioReais = tarifaVigente(pixEnvio?.feeValue, pixEnvio?.discountValue, pixEnvio?.expirationDate);
  const recebidoReais = tarifaVigente(
    pixRecebido?.fixedFeeValue,
    pixRecebido?.fixedFeeValueWithDiscount,
    pixRecebido?.discountExpiration,
  );
  const envioGratis = inteiroNaoNegativo(transferencia?.monthlyTransfersWithoutFee);
  const recebidoGratis = inteiroNaoNegativo(pixRecebido?.monthlyCreditsWithoutFee);
  return {
    origem,
    taxaCentavos: reaisParaCentavos(envioReais),
    taxaPercentual: "0",
    recebimentoCentavos: reaisParaCentavos(recebidoReais),
    recebimentoPercentual: percentualDeNumero(numeroFinito(pixRecebido?.percentageFee)),
    ...(envioGratis !== undefined ? { envioGratisMes: envioGratis } : {}),
    ...(recebidoGratis !== undefined ? { recebimentoGratisMes: recebidoGratis } : {}),
  };
}

export async function consultarTaxasAsaas(): Promise<TaxasPsp | undefined> {
  if (!asaasConfigurado()) return undefined;
  const resposta = await chamarAsaas("GET", "/v3/myAccount/fees/");
  if (!resposta.ok) return undefined;
  return taxasDeJsonAsaas(resposta.json, rotuloAsaas() || "Asaas");
}

export function chaveQrAsaas(qrId: string): string {
  return `linhabank:asaas:qr:${qrId}`;
}

export function tipoChaveAsaas(chave: string): TipoChaveAsaas | undefined {
  const destino = chave.trim();
  if (destino.length === 0) return undefined;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino.toLowerCase())) return "EMAIL";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(destino)) return "EVP";
  if (/^\+55\d{10,11}$/.test(destino)) return "PHONE";
  const digitos = destino.replace(/\D/g, "");
  if (/^\d{14}$/.test(digitos) && destino === digitos) return "CNPJ";
  if (/^\d{11}$/.test(digitos) && destino === digitos) return "CPF";
  return undefined;
}

export function chaveDestinoAsaas(chave: string, tipo: TipoChaveAsaas): string {
  const destino = chave.trim();
  if (tipo === "EMAIL") return destino.toLowerCase();
  if (tipo === "EVP") return destino.toLowerCase();
  if (tipo === "PHONE") return destino.replace(/^\+55/, "").replace(/\D/g, "");
  return destino.replace(/\D/g, "");
}

export function reaisDeCentavosAsaas(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function centavosDeReaisAsaas(valor: number): number {
  return Math.round(valor * 100);
}

export function lerEventoAsaas(bruto: unknown): EventoAsaas | undefined {
  const lido = eventoAsaasSchema.safeParse(bruto);
  return lido.success ? lido.data : undefined;
}

export function avisoDePagamentoAsaas(evento: EventoAsaas): AvisoPix | undefined {
  if (evento.event !== "PAYMENT_RECEIVED") return undefined;
  const pagamento = evento.payment;
  if (pagamento === undefined || typeof pagamento.value !== "number") return undefined;
  const pix = pagamento.pixQrCodeId !== undefined || pagamento.billingType === "PIX";
  const referencia = pagamento.externalReference?.trim();
  const cobrancaId = referencia !== undefined && /^dep-[0-9a-f]{8,}$/i.test(referencia) ? referencia : undefined;
  if (!pix && cobrancaId === undefined) return undefined;
  const id = (pagamento.id ?? evento.id ?? "").trim();
  if (id.length < 8) return undefined;
  const txid = pagamento.pixTransaction?.txid?.trim();
  return {
    id: id.slice(0, 80),
    valorCentavos: centavosDeReaisAsaas(pagamento.value),
    pagador: pagamento.description?.trim().slice(0, 80) || undefined,
    endToEndId: pagamento.pixTransaction?.endToEndIdentifier?.trim().slice(0, 80) || undefined,
    txid: txid !== undefined && txid.length >= 8 ? txid.slice(0, 35) : undefined,
    cobrancaId,
    pixQrCodeId: pagamento.pixQrCodeId?.trim(),
  };
}

export function referenciaTransferenciaAsaas(evento: EventoAsaas): string | undefined {
  if (evento.event !== "TRANSFER_FAILED" && evento.event !== "TRANSFER_CANCELLED") return undefined;
  const referencia = evento.transfer?.externalReference?.trim();
  return referencia !== undefined && referencia.length >= 4 ? referencia.slice(0, 100) : undefined;
}

export async function enviarPixAsaas(pedido: PedidoEnvioPsp): Promise<RespostaEnvio> {
  if (!asaasConfigurado()) return { ok: false, motivo: "gateway_pendente" };
  const tipo = tipoChaveAsaas(pedido.chaveDestino);
  if (tipo === undefined) return { ok: false, motivo: "destino_invalido" };
  const resposta = await chamarAsaas("POST", "/v3/transfers", {
    value: reaisDeCentavosAsaas(pedido.valorCentavos),
    pixAddressKey: chaveDestinoAsaas(pedido.chaveDestino, tipo),
    pixAddressKeyType: tipo,
    description: `LinhaBank ${pedido.id}`.slice(0, 140),
    externalReference: pedido.id.slice(0, 100),
  });
  if (!resposta.ok) return mapearErroEnvio(resposta);
  const id = typeof resposta.json.id === "string" ? resposta.json.id : "";
  const status = typeof resposta.json.status === "string" ? resposta.json.status : "";
  if (status === "FAILED" || status === "CANCELLED") return { ok: false, motivo: "recusado" };
  if (resposta.json.authorized === false) return { ok: false, motivo: "recusado" };
  const endToEnd =
    (typeof resposta.json.endToEndIdentifier === "string" && resposta.json.endToEndIdentifier.length >= 6
      ? resposta.json.endToEndIdentifier
      : undefined) ?? (id.length >= 6 ? id : undefined);
  if (endToEnd === undefined) return { ok: false, motivo: "gateway_indisponivel" };
  if (status === "PENDING" || status === "BANK_PROCESSING" || status === "DONE" || status.length === 0) {
    return { ok: true, endToEndId: endToEnd.slice(0, 80) };
  }
  return { ok: false, motivo: "recusado" };
}

export async function cobrancaAsaas(pedido: {
  valorCentavos: number;
  txid: string;
  cobrancaId: string;
}): Promise<CobrancaPsp | { ok: false; motivo: "chave_ausente" | "gateway_indisponivel" }> {
  if (!asaasConfigurado()) return { ok: false, motivo: "gateway_indisponivel" };
  const chave = (chaveRecebimento() ?? (await chavePixAsaas()))?.trim();
  if (chave === undefined || chave.length === 0) return { ok: false, motivo: "chave_ausente" };
  const resposta = await chamarAsaas("POST", "/v3/pix/qrCodes/static", {
    addressKey: chave,
    description: `LinhaBank ${pedido.txid}`.slice(0, 40),
    value: reaisDeCentavosAsaas(pedido.valorCentavos),
    format: "PAYLOAD",
    expirationSeconds: 86_400,
    allowsMultiplePayments: false,
    externalReference: pedido.cobrancaId.slice(0, 100),
  });
  if (!resposta.ok) {
    return { ok: false, motivo: resposta.status === 400 ? "chave_ausente" : "gateway_indisponivel" };
  }
  const copiaECola = typeof resposta.json.payload === "string" ? resposta.json.payload.trim() : "";
  const qrId = typeof resposta.json.id === "string" ? resposta.json.id.trim() : "";
  if (copiaECola.length < 20) return { ok: false, motivo: "gateway_indisponivel" };
  return {
    copiaECola,
    provedor: "asaas",
    chave,
    qrId: qrId.length >= 8 ? qrId : undefined,
  };
}

export async function chavePixAsaas(): Promise<string | undefined> {
  const agora = Date.now();
  if (chavePixCache !== undefined && agora - chavePixCache.em < 10 * 60_000) return chavePixCache.chave;
  const resposta = await chamarAsaas("GET", "/v3/pix/addressKeys?status=ACTIVE");
  if (!resposta.ok) {
    chavePixCache = { em: agora };
    return undefined;
  }
  const lista = Array.isArray(resposta.json.data) ? resposta.json.data : [];
  for (const item of lista) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const linha = item as Record<string, unknown>;
    const status = typeof linha.status === "string" ? linha.status : "";
    const chave = typeof linha.key === "string" ? linha.key.trim() : "";
    if ((status === "ACTIVE" || status.length === 0) && chave.length >= 8) {
      chavePixCache = { em: agora, chave };
      return chave;
    }
  }
  chavePixCache = { em: agora };
  return undefined;
}

type RespostaAsaas = { ok: true; json: Record<string, unknown> } | { ok: false; status: number; json: Record<string, unknown> };

async function chamarAsaas(metodo: "GET" | "POST", caminho: string, corpo?: Record<string, unknown>): Promise<RespostaAsaas> {
  const token = chaveAsaas();
  if (token.length === 0) return { ok: false, status: 0, json: {} };
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": AGENT,
      access_token: token,
    };
    if (metodo === "POST") headers["content-type"] = "application/json";
    const resposta = await fetch(`${urlAsaas()}${caminho}`, {
      method: metodo,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers,
      body: metodo === "POST" ? JSON.stringify(corpo ?? {}) : undefined,
    });
    const json = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
    if (!resposta.ok) return { ok: false, status: resposta.status, json };
    return { ok: true, json };
  } catch {
    return { ok: false, status: 0, json: {} };
  }
}

function objeto(valor: unknown): Record<string, unknown> | undefined {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor as Record<string, unknown>;
}

function numeroFinito(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : undefined;
}

function inteiroNaoNegativo(valor: unknown): number | undefined {
  const n = numeroFinito(valor);
  if (n === undefined || !Number.isSafeInteger(n) || n < 0 || n > 1_000_000) return undefined;
  return n;
}

function reaisParaCentavos(reais: number): number {
  if (!Number.isFinite(reais) || reais <= 0) return 0;
  return Math.min(500_000, Math.max(0, Math.round(reais * 100)));
}

function percentualDeNumero(valor: number | undefined): string {
  if (valor === undefined || !Number.isFinite(valor) || valor <= 0) return "0";
  return valor.toFixed(2).replace(".", ",").replace(/0+$/, "").replace(/,$/, "") || "0";
}

function tarifaVigente(padrao: unknown, desconto: unknown, expiracao: unknown): number {
  const base = Math.max(0, numeroFinito(padrao) ?? 0);
  const promo = numeroFinito(desconto);
  if (promo === undefined || promo < 0) return base;
  if (typeof expiracao !== "string" || expiracao.trim().length === 0) return promo;
  const ate = Date.parse(expiracao);
  if (!Number.isFinite(ate) || ate > Date.now()) return promo;
  return base;
}

function mapearErroEnvio(resposta: { status: number; json: Record<string, unknown> }): RespostaEnvio {
  const erros = Array.isArray(resposta.json.errors) ? resposta.json.errors : [];
  for (const item of erros) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const linha = item as { code?: unknown; description?: unknown };
    const texto = `${String(linha.code ?? "")} ${String(linha.description ?? "")}`.toLowerCase();
    if (/chave|pixaddress|invalid.*key|key.*invalid|destino/.test(texto)) return { ok: false, motivo: "destino_invalido" };
  }
  if (resposta.status === 400) return { ok: false, motivo: "recusado" };
  return { ok: false, motivo: "gateway_indisponivel" };
}
