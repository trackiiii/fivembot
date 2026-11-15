import { configAtual, pontosPercentuaisDe } from "./config.js";

export type LadoPixExterno = "envio" | "recebimento";

export type DetalheTaxaPix = {
  gatewayCentavos: number;
  adicionalCentavos: number;
  percentualCentavos: number;
  totalCentavos: number;
};

export function detalheTaxaPixExterno(valorCentavos: number, lado: LadoPixExterno = "envio"): DetalheTaxaPix {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    return { gatewayCentavos: 0, adicionalCentavos: 0, percentualCentavos: 0, totalCentavos: 0 };
  }
  const cfg = configAtual();
  const gatewayCentavos =
    lado === "recebimento" ? Math.max(0, cfg.taxaGatewayRecebimentoCentavos) : Math.max(0, cfg.taxaGatewayCentavos);
  const adicionalCentavos = Math.max(0, cfg.taxaCentavos);
  const pontos =
    pontosPercentuaisDe(cfg.taxaPercentual) +
    (lado === "recebimento" ? pontosPercentuaisDe(cfg.taxaGatewayRecebimentoPercentual) : 0);
  const percentualCentavos = Math.round((valorCentavos * pontos) / 10_000);
  const total = gatewayCentavos + adicionalCentavos + percentualCentavos;
  const totalCentavos = Number.isSafeInteger(total) && total > 0 ? Math.min(total, 500_000) : 0;
  return { gatewayCentavos, adicionalCentavos, percentualCentavos, totalCentavos };
}

export function taxaPixExternoCentavos(valorCentavos: number): number {
  return detalheTaxaPixExterno(valorCentavos, "envio").totalCentavos;
}

export function taxaPixExternoRecebimentoCentavos(valorCentavos: number): number {
  return detalheTaxaPixExterno(valorCentavos, "recebimento").totalCentavos;
}
