import { configAtual, pontosPercentuaisDe } from "./config.js";

export function taxaPixExternoCentavos(valorCentavos: number): number {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) return 0;
  const cfg = configAtual();
  const percentual = Math.round((valorCentavos * pontosPercentuaisDe(cfg.taxaPercentual)) / 10_000);
  const total = cfg.taxaCentavos + percentual;
  if (!Number.isSafeInteger(total) || total < 0) return 0;
  return Math.min(total, 500_000);
}
