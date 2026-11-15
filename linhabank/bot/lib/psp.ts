import {
  asaasConfigurado,
  cobrancaAsaas,
  consultarTaxasAsaas,
  enviarPixAsaas,
  rotuloAsaas,
  type TaxasPsp,
} from "./asaas.js";
import { chaveRecebimento, montarCopiaECola } from "./brcode.js";
import { configAtual } from "./config.js";
import { enviarPixGateway, gatewayHttpConfigurada, type RespostaEnvio } from "./gateway.js";
import { emSandbox } from "./modo.js";

export type PedidoEnvioPsp = {
  id: string;
  referencia: string;
  valorCentavos: number;
  chaveDestino: string;
};

export type CobrancaPsp = {
  copiaECola: string;
  provedor: string;
  chave: string;
  qrId?: string;
};

export type PedidoCobrancaPsp = {
  valorCentavos: number;
  txid: string;
  cobrancaId: string;
};

export type PspAdapter = {
  nome: string;
  enviar(pedido: PedidoEnvioPsp): Promise<RespostaEnvio>;
  cobranca(pedido: PedidoCobrancaPsp): Promise<CobrancaPsp | { ok: false; motivo: "chave_ausente" | "gateway_indisponivel" }>;
};

function cobrancaLocal(pedido: PedidoCobrancaPsp): CobrancaPsp | { ok: false; motivo: "chave_ausente" } {
  const chave = chaveRecebimento() ?? (emSandbox() ? "sandbox@linhabank.test" : undefined);
  if (chave === undefined) return { ok: false, motivo: "chave_ausente" };
  return {
    copiaECola: montarCopiaECola({
      chave,
      valorCentavos: pedido.valorCentavos,
      txid: pedido.txid,
      nome: "LINHABANK",
      cidade: configAtual().cidadeRecebimento,
    }),
    provedor: emSandbox() ? "sandbox" : "brcode",
    chave,
  };
}

const httpPsp: PspAdapter = {
  nome: "http",
  enviar: enviarPixGateway,
  async cobranca(pedido) {
    return cobrancaLocal(pedido);
  },
};

const pendentePsp: PspAdapter = {
  nome: "pendente",
  async enviar() {
    return { ok: false, motivo: "gateway_pendente" };
  },
  async cobranca(pedido) {
    return cobrancaLocal(pedido);
  },
};

const asaasPsp: PspAdapter = {
  nome: "asaas",
  enviar: enviarPixAsaas,
  async cobranca(pedido) {
    const gerada = await cobrancaAsaas(pedido);
    if (!("ok" in gerada)) return gerada;
    if (emSandbox() && gerada.motivo === "chave_ausente") return cobrancaLocal(pedido);
    return gerada;
  },
};

function urlHttpEAsaas(): boolean {
  const bruto = process.env.PIX_GATEWAY_URL?.trim() ?? "";
  if (bruto.length === 0) return false;
  try {
    const host = new URL(bruto).hostname;
    return host === "api.asaas.com" || host === "api-sandbox.asaas.com";
  } catch {
    return false;
  }
}

export function pspAtual(): PspAdapter {
  if (gatewayHttpConfigurada() && !urlHttpEAsaas()) return httpPsp;
  if (asaasConfigurado()) return asaasPsp;
  if (gatewayHttpConfigurada()) return httpPsp;
  return pendentePsp;
}

export function rotuloLiquidacao(): string {
  const psp = pspAtual();
  if (psp.nome === "asaas") return rotuloAsaas();
  if (psp.nome === "http") return "convênio ativo";
  return "convênio não contratado";
}

export type { TaxasPsp };

export async function consultarTaxasGateway(): Promise<TaxasPsp | undefined> {
  if (pspAtual().nome !== "asaas") return undefined;
  try {
    return await consultarTaxasAsaas();
  } catch {
    return undefined;
  }
}
