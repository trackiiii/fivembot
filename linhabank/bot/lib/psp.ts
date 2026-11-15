import { enviarPixGateway, gatewayConfigurada, type RespostaEnvio } from "./gateway.js";
import { chaveRecebimento, montarCopiaECola } from "./brcode.js";
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
};

export type PspAdapter = {
  nome: string;
  enviar(pedido: PedidoEnvioPsp): Promise<RespostaEnvio>;
  cobranca(pedido: { valorCentavos: number; txid: string }): CobrancaPsp | { ok: false; motivo: "chave_ausente" };
};

function cobrancaLocal(pedido: { valorCentavos: number; txid: string }): CobrancaPsp | { ok: false; motivo: "chave_ausente" } {
  const chave = chaveRecebimento() ?? (emSandbox() ? "sandbox@linhabank.test" : undefined);
  if (chave === undefined) return { ok: false, motivo: "chave_ausente" };
  return {
    copiaECola: montarCopiaECola({
      chave,
      valorCentavos: pedido.valorCentavos,
      txid: pedido.txid,
      nome: "LINHABANK",
      cidade: process.env.PIX_RECEBIMENTO_CIDADE ?? "SAO PAULO",
    }),
    provedor: emSandbox() ? "sandbox" : "brcode",
    chave,
  };
}

const httpPsp: PspAdapter = {
  nome: "http",
  enviar: enviarPixGateway,
  cobranca: cobrancaLocal,
};

const pendentePsp: PspAdapter = {
  nome: "pendente",
  async enviar() {
    return { ok: false, motivo: "gateway_pendente" };
  },
  cobranca: cobrancaLocal,
};

export function pspAtual(): PspAdapter {
  return gatewayConfigurada() ? httpPsp : pendentePsp;
}
