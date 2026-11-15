import { configAtual, pontosPercentuaisDe } from "./config.js";

export type DetalheTaxaPix = {
  gatewayCentavos: number;
  adicionalCentavos: number;
  percentualCentavos: number;
  totalCentavos: number;
};

export function detalheTaxaPixExterno(valorCentavos: number): DetalheTaxaPix {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    return { gatewayCentavos: 0, adicionalCentavos: 0, percentualCentavos: 0, totalCentavos: 0 };
  }
  const cfg = configAtual();
  const gatewayCentavos = Math.max(0, cfg.taxaGatewayCentavos);
  const adicionalCentavos = Math.max(0, cfg.taxaCentavos);
  const percentualCentavos = Math.round((valorCentavos * pontosPercentuaisDe(cfg.taxaPercentual)) / 10_000);
  const total = gatewayCentavos + adicionalCentavos + percentualCentavos;
  const totalCentavos = Number.isSafeInteger(total) && total > 0 ? Math.min(total, 500_000) : 0;
  return { gatewayCentavos, adicionalCentavos, percentualCentavos, totalCentavos };
}

export function taxaPixExternoCentavos(valorCentavos: number): number {
  return detalheTaxaPixExterno(valorCentavos).totalCentavos;
}
