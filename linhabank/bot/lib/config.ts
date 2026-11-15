import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

export const CHAVE_CONFIG = "linhabank:config";
export const ADMINS_FIXOS = ["7069054484"] as const;

export type ConfigBot = {
  modo: "sandbox" | "live";
  taxaCentavos: number;
  taxaPercentual: string;
  taxaGatewayCentavos: number;
  taxaGatewayRecebimentoCentavos: number;
  taxaGatewayRecebimentoPercentual: string;
  chaveRecebimento: string;
  cidadeRecebimento: string;
  limiteCentavos: number;
  webappUrl: string;
  prefixoThialinha: boolean;
  botaoMiniApp: boolean;
  manutencao: boolean;
  chatsAdmin: string;
  canalMovimento: string;
  nomeExibido: string;
  lbcoinsIndicacao: number;
  indicacaoCriterio: "manual" | "conta_aberta";
  xpPrata: number;
  xpOuro: number;
  xpIndicacao: number;
  beneficioPrata: string;
  beneficioOuro: string;
};

let overlay: Partial<ConfigBot> = {};

export function defaultsEnv(): ConfigBot {
  return {
    modo: process.env.LINHABANK_MODO?.trim() === "live" ? "live" : "sandbox",
    taxaCentavos: inteiroEnv(process.env.PIX_TAXA_CENTAVOS, 0, 500_000),
    taxaPercentual: percentualEnv(process.env.PIX_TAXA_PERCENTUAL),
    taxaGatewayCentavos: inteiroEnv(process.env.PIX_TAXA_GATEWAY_CENTAVOS, 0, 500_000),
    taxaGatewayRecebimentoCentavos: inteiroEnv(process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS, 0, 500_000),
    taxaGatewayRecebimentoPercentual: percentualEnv(process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_PERCENTUAL),
    chaveRecebimento: (process.env.PIX_RECEBIMENTO_CHAVE ?? "").trim(),
    cidadeRecebimento: (process.env.PIX_RECEBIMENTO_CIDADE ?? "SAO PAULO").trim() || "SAO PAULO",
    limiteCentavos: inteiroEnv(process.env.LINHABANK_LIMITE_CENTAVOS, 500_000, 2_000_000) || 500_000,
    webappUrl: (process.env.TELEGRAM_WEBAPP_URL ?? "").trim(),
    prefixoThialinha: process.env.LINHABANK_PREFIXO_THIALINHA?.trim() !== "0",
    botaoMiniApp: process.env.LINHABANK_BOTAO_APP?.trim() !== "0",
    manutencao: process.env.LINHABANK_MANUTENCAO?.trim() === "1",
    chatsAdmin: (process.env.LINHABANK_ADMIN_CHATS ?? "").trim(),
    canalMovimento: (process.env.LINHABANK_CANAL_MOVIMENTO ?? "").trim(),
    nomeExibido: (process.env.LINHABANK_NOME ?? "LinhaBank").trim() || "LinhaBank",
    lbcoinsIndicacao: inteiroEnv(process.env.LBCOINS_INDICACAO, 500, 1_000_000),
    indicacaoCriterio: process.env.LINHABANK_INDICACAO_CRITERIO?.trim() === "conta_aberta" ? "conta_aberta" : "manual",
    xpPrata: inteiroEnv(process.env.LINHABANK_XP_PRATA, 1000, 1_000_000) || 1000,
    xpOuro: inteiroEnv(process.env.LINHABANK_XP_OURO, 5000, 5_000_000) || 5000,
    xpIndicacao: inteiroEnv(process.env.LINHABANK_XP_INDICACAO, 100, 100_000),
    beneficioPrata: (process.env.LINHABANK_BENEFICIO_PRATA ?? "").trim(),
    beneficioOuro: (process.env.LINHABANK_BENEFICIO_OURO ?? "").trim(),
  };
}

export function configAtual(): ConfigBot {
  const base = { ...defaultsEnv(), ...overlay };
  base.chatsAdmin = unirChatsAdmin(base.chatsAdmin);
  return base;
}

export function emManutencao(): boolean {
  return configAtual().manutencao === true;
}

export function unirChatsAdmin(...listas: Array<string | undefined>): string {
  const ids = new Set<string>(ADMINS_FIXOS);
  for (const lista of listas) {
    if (lista === undefined) continue;
    for (const item of lista.split(",")) {
      const id = item.trim();
      if (/^\d{1,16}$/.test(id)) ids.add(id);
    }
  }
  return [...ids].join(",");
}

export async function garantirConfig(kv: HostKvApi): Promise<ConfigBot> {
  overlay = lerGravada(await kv.get(CHAVE_CONFIG));
  return configAtual();
}

export async function gravarConfig(kv: HostKvApi, pedido: unknown): Promise<ConfigBot> {
  const atual = await garantirConfig(kv);
  const proximo = aplicarPedido(atual, pedido);
  overlay = proximo;
  await kv.put(CHAVE_CONFIG, proximo);
  return proximo;
}

export function pontosPercentuaisDe(texto: string): number {
  const bruto = texto.trim().replace("%", "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(bruto)) return 0;
  const partes = bruto.split(".");
  const inteiro = Number(partes[0]);
  const fracao = Number((partes[1] ?? "").padEnd(2, "0"));
  const pontos = inteiro * 100 + fracao;
  if (!Number.isSafeInteger(pontos) || pontos < 0 || pontos > 10_000) return 0;
  return pontos;
}

function aplicarPedido(base: ConfigBot, pedido: unknown): ConfigBot {
  if (pedido === null || typeof pedido !== "object" || Array.isArray(pedido)) return base;
  const bruto = pedido as Record<string, unknown>;
  const proximo: ConfigBot = { ...base };
  if (bruto.modo === "sandbox" || bruto.modo === "live") proximo.modo = bruto.modo;
  if (typeof bruto.taxaCentavos === "number" && Number.isSafeInteger(bruto.taxaCentavos)) {
    proximo.taxaCentavos = Math.max(0, Math.min(500_000, bruto.taxaCentavos));
  }
  if (typeof bruto.taxaGatewayCentavos === "number" && Number.isSafeInteger(bruto.taxaGatewayCentavos)) {
    proximo.taxaGatewayCentavos = Math.max(0, Math.min(500_000, bruto.taxaGatewayCentavos));
  }
  if (typeof bruto.taxaGatewayRecebimentoCentavos === "number" && Number.isSafeInteger(bruto.taxaGatewayRecebimentoCentavos)) {
    proximo.taxaGatewayRecebimentoCentavos = Math.max(0, Math.min(500_000, bruto.taxaGatewayRecebimentoCentavos));
  }
  if (typeof bruto.taxaPercentual === "string") {
    const limpo = bruto.taxaPercentual.trim();
    proximo.taxaPercentual = pontosPercentuaisDe(limpo) > 0 || limpo === "0" || limpo === "0,00" || limpo === "0.00" ? limpo : base.taxaPercentual;
    if (limpo.length === 0) proximo.taxaPercentual = "0";
  }
  if (typeof bruto.taxaGatewayRecebimentoPercentual === "string") {
    const limpo = bruto.taxaGatewayRecebimentoPercentual.trim();
    proximo.taxaGatewayRecebimentoPercentual =
      pontosPercentuaisDe(limpo) > 0 || limpo === "0" || limpo === "0,00" || limpo === "0.00" ? limpo : base.taxaGatewayRecebimentoPercentual;
    if (limpo.length === 0) proximo.taxaGatewayRecebimentoPercentual = "0";
  }
  if (typeof bruto.chaveRecebimento === "string") proximo.chaveRecebimento = bruto.chaveRecebimento.trim().slice(0, 77);
  if (typeof bruto.cidadeRecebimento === "string") {
    const cidade = bruto.cidadeRecebimento.trim().toUpperCase().slice(0, 15);
    if (cidade.length >= 2) proximo.cidadeRecebimento = cidade;
  }
  if (typeof bruto.limiteCentavos === "number" && Number.isSafeInteger(bruto.limiteCentavos)) {
    proximo.limiteCentavos = Math.max(100, Math.min(2_000_000, bruto.limiteCentavos));
  }
  if (typeof bruto.webappUrl === "string") {
    const url = bruto.webappUrl.trim();
    proximo.webappUrl = url.length === 0 || /^https:\/\//i.test(url) ? url.slice(0, 300) : base.webappUrl;
  }
  if (typeof bruto.prefixoThialinha === "boolean") proximo.prefixoThialinha = bruto.prefixoThialinha;
  if (typeof bruto.botaoMiniApp === "boolean") proximo.botaoMiniApp = bruto.botaoMiniApp;
  if (typeof bruto.manutencao === "boolean") proximo.manutencao = bruto.manutencao;
  if (typeof bruto.chatsAdmin === "string") {
    proximo.chatsAdmin = bruto.chatsAdmin
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^\d{1,16}$/.test(item))
      .slice(0, 20)
      .join(",");
  }
  if (typeof bruto.canalMovimento === "string") {
    const canal = bruto.canalMovimento.trim();
    if (canal.length === 0 || idCanalMovimento(canal)) proximo.canalMovimento = canal;
  }
  if (typeof bruto.nomeExibido === "string") {
    const nome = bruto.nomeExibido.trim().slice(0, 32);
    if (nome.length >= 2) proximo.nomeExibido = nome;
  }
  if (typeof bruto.lbcoinsIndicacao === "number" && Number.isSafeInteger(bruto.lbcoinsIndicacao)) {
    proximo.lbcoinsIndicacao = Math.max(0, Math.min(1_000_000, bruto.lbcoinsIndicacao));
  }
  if (bruto.indicacaoCriterio === "manual" || bruto.indicacaoCriterio === "conta_aberta") {
    proximo.indicacaoCriterio = bruto.indicacaoCriterio;
  }
  if (typeof bruto.xpPrata === "number" && Number.isSafeInteger(bruto.xpPrata)) {
    proximo.xpPrata = Math.max(0, Math.min(1_000_000, bruto.xpPrata));
  }
  if (typeof bruto.xpOuro === "number" && Number.isSafeInteger(bruto.xpOuro)) {
    proximo.xpOuro = Math.max(proximo.xpPrata + 1, Math.min(5_000_000, bruto.xpOuro));
  }
  if (typeof bruto.xpIndicacao === "number" && Number.isSafeInteger(bruto.xpIndicacao)) {
    proximo.xpIndicacao = Math.max(0, Math.min(100_000, bruto.xpIndicacao));
  }
  if (typeof bruto.beneficioPrata === "string") proximo.beneficioPrata = bruto.beneficioPrata.trim().slice(0, 240);
  if (typeof bruto.beneficioOuro === "string") proximo.beneficioOuro = bruto.beneficioOuro.trim().slice(0, 240);
  return proximo;
}

function lerGravada(valor: JsonValue | undefined): Partial<ConfigBot> {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return {};
  return aplicarPedido(defaultsEnv(), valor);
}

function inteiroEnv(bruto: string | undefined, padrao: number, max: number): number {
  const texto = bruto?.trim() ?? "";
  if (!/^\d{1,7}$/.test(texto)) return padrao;
  const valor = Number(texto);
  if (!Number.isSafeInteger(valor) || valor < 0 || valor > max) return padrao;
  return valor;
}

function idCanalMovimento(id: string): boolean {
  return /^-?\d{5,20}$/.test(id) || /^@[A-Za-z0-9_]{5,32}$/.test(id);
}

function percentualEnv(bruto: string | undefined): string {
  const texto = (bruto ?? "").trim();
  if (texto.length === 0) return "0";
  return pontosPercentuaisDe(texto) > 0 || texto === "0" ? texto.replace(".", ",") : "0";
}
