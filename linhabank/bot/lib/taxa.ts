import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

carregarTaxaLocal();

function carregarTaxaLocal(): void {
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
    if (!/^PIX_TAXA_[A-Z0-9_]+$/.test(chave)) continue;
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

function centavosFixos(): number {
  const bruto = process.env.PIX_TAXA_CENTAVOS?.trim() ?? "";
  if (!/^\d{1,7}$/.test(bruto)) return 0;
  const valor = Number(bruto);
  return Number.isSafeInteger(valor) ? valor : 0;
}

function pontosPercentuais(): number {
  const bruto = (process.env.PIX_TAXA_PERCENTUAL ?? "").trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(bruto)) return 0;
  const partes = bruto.split(".");
  const inteiro = Number(partes[0]);
  const fracao = Number((partes[1] ?? "").padEnd(2, "0"));
  const pontos = inteiro * 100 + fracao;
  if (!Number.isSafeInteger(pontos) || pontos < 0 || pontos > 10_000) return 0;
  return pontos;
}

export function taxaPixExternoCentavos(valorCentavos: number): number {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) return 0;
  const percentual = Math.round((valorCentavos * pontosPercentuais()) / 10_000);
  const total = centavosFixos() + percentual;
  if (!Number.isSafeInteger(total) || total < 0) return 0;
  return Math.min(total, 500_000);
}
