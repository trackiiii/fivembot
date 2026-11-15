import { createHash, randomInt } from "node:crypto";

import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import {
  consultarSaldo,
  enviarPixGateway,
  pagarBoletoGateway,
  transferirGateway,
  type RespostaGateway,
} from "./gateway.js";

export const TERMOS_VERSAO = "2026-11-15";
export const AGENCIA = "0001";
const MAX_CENTAVOS = 500_000;

export type Conta = {
  chatId: string;
  nome: string;
  termosVersao: string;
  aceitouEm: string;
  agencia: string;
  numero: string;
  chavePix: string;
  cartaoFinal: string;
  cartaoBloqueado: boolean;
};

export type ResumoConta = {
  aberta: boolean;
  acabouDeAbrir: boolean;
};

export type PedidoConta = {
  acao: "resumo" | "extrato" | "enviar_pix" | "transferir" | "pagar_boleto" | "bloquear_cartao" | "desbloquear_cartao";
  valor?: string;
  chavePix?: string;
  conta?: string;
  descricao?: string;
};

export type ResultadoOperacao = {
  ok: boolean;
  motivo?: string;
  saldo?: string;
  valor?: string;
  destino?: string;
  endToEndId?: string;
  inalterado?: boolean;
  conta?: {
    agencia: string;
    numero: string;
    chavePix: string;
    cartaoFinal: string;
    cartaoBloqueado: boolean;
  };
  extrato?: { em: string; tipo: string; valor: string; descricao: string }[];
};

export const TEXTO_TERMOS = [
  "Opa, eu sou a Thialinha.",
  "",
  "Pra eu abrir a sua conta digital no LinhaBank, você precisa concordar com os termos:",
  "",
  "1. A conta é sua. Cada pessoa tem a própria conta, com número, chave PIX e cartão virtual.",
  "2. O saldo de cada conta fica na gateway de PIX. Eu só mostro o número que ela devolver.",
  "3. PIX, transferência e boleto saem desse saldo. Sem a gateway ligada, eu não movo dinheiro.",
  "4. Eu não peço senha, código, CVV nem o número completo do cartão.",
  "",
  "Se estiver de acordo, toca em Concordo ou responde CONCORDO.",
].join("\n");

export const TEXTO_RECUSA =
  "Beleza. Sem o aceite eu não abro a conta. Quando quiser, manda /start de novo.";

export function decidirTermos(texto: string): "concordo" | "recuso" | "pedir" | "seguir" {
  const limpo = texto
    .trim()
    .toLowerCase()
    .replace(/@\w+/g, "")
    .replace(/[!?.]+$/g, "")
    .trim();
  if (limpo === "/start" || limpo.startsWith("/start ") || limpo === "/ajuda" || limpo.startsWith("/ajuda ")) {
    return "pedir";
  }
  if (/^(concordo|eu concordo|aceito|aceito os termos|sim, concordo|sim concordo)$/.test(limpo)) {
    return "concordo";
  }
  if (/^(não concordo|nao concordo|recuso|agora não|agora nao)$/.test(limpo)) return "recuso";
  return "seguir";
}

export function chatDaSessao(continuationKey: string | null | undefined): string | undefined {
  if (continuationKey === undefined || continuationKey === null) return undefined;
  const achado = continuationKey.match(/tg:(\d+):\d+/);
  return achado?.[1];
}

export function reaisDe(centavos: number): string {
  const sinal = centavos < 0 ? "-" : "";
  const absoluto = Math.abs(centavos);
  const reais = Math.floor(absoluto / 100).toString();
  const cents = String(absoluto % 100).padStart(2, "0");
  return `${sinal}${reais},${cents}`;
}

export function centavosDe(valor: string | undefined): number | undefined {
  if (valor === undefined) return undefined;
  const limpo = valor.trim().replace(/\s/g, "").replace(/^r\$/i, "");
  const achado = limpo.match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (achado === null) return undefined;
  const reais = Number(achado[1]);
  const fracao = (achado[2] ?? "").padEnd(2, "0");
  const total = reais * 100 + Number(fracao);
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_CENTAVOS) return undefined;
  return total;
}

function chaveContaChat(chatId: string): string {
  return `linhabank:conta:chat:${chatId}`;
}

function chaveContaNumero(numero: string): string {
  return `linhabank:conta:numero:${numero}`;
}

function chaveContaPix(chave: string): string {
  return `linhabank:conta:pix:${chave}`;
}

function chaveOperacao(sessionId: string, pedido: PedidoConta): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([pedido.acao, pedido.valor ?? "", pedido.chavePix ?? "", pedido.conta ?? "", pedido.descricao ?? ""]))
    .digest("hex")
    .slice(0, 16);
  return `linhabank:op:${sessionId}:${digest}`;
}

function comoRegistro(valor: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

export function lerContaGravada(valor: JsonValue | undefined): Conta | undefined {
  const item = comoRegistro(valor);
  if (item === undefined) return undefined;
  if (
    typeof item.chatId !== "string" ||
    typeof item.nome !== "string" ||
    typeof item.numero !== "string" ||
    typeof item.chavePix !== "string" ||
    typeof item.cartaoFinal !== "string" ||
    typeof item.cartaoBloqueado !== "boolean"
  ) {
    return undefined;
  }
  return {
    chatId: item.chatId,
    nome: item.nome,
    termosVersao: typeof item.termosVersao === "string" ? item.termosVersao : TERMOS_VERSAO,
    aceitouEm: typeof item.aceitouEm === "string" ? item.aceitouEm : "",
    agencia: AGENCIA,
    numero: item.numero,
    chavePix: item.chavePix,
    cartaoFinal: item.cartaoFinal,
    cartaoBloqueado: item.cartaoBloqueado,
  };
}

async function gravarConta(kv: HostKvApi, conta: Conta): Promise<void> {
  await kv.put(chaveContaChat(conta.chatId), conta);
  await kv.put(chaveContaNumero(conta.numero), conta.chatId);
  await kv.put(chaveContaPix(conta.chavePix), conta.chatId);
}

export async function lerConta(kv: HostKvApi, chatId: string): Promise<Conta | undefined> {
  return lerContaGravada(await kv.get(chaveContaChat(chatId)));
}

function novoNumero(): string {
  return String(10_000_000 + randomInt(90_000_000));
}

function novoFinalCartao(): string {
  return String(randomInt(10_000)).padStart(4, "0");
}

export async function aceitarTermos(kv: HostKvApi, chatId: string, nome: string): Promise<Conta> {
  const existente = await lerConta(kv, chatId);
  if (existente !== undefined) return existente;
  let numero = novoNumero();
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const ocupado = await kv.get(chaveContaNumero(numero));
    if (ocupado === undefined) break;
    numero = novoNumero();
  }
  const conta: Conta = {
    chatId,
    nome,
    termosVersao: TERMOS_VERSAO,
    aceitouEm: new Date().toISOString(),
    agencia: AGENCIA,
    numero,
    chavePix: `lb${numero}@linhabank`,
    cartaoFinal: novoFinalCartao(),
    cartaoBloqueado: false,
  };
  await gravarConta(kv, conta);
  return conta;
}

function perfil(conta: Conta): ResultadoOperacao["conta"] {
  return {
    agencia: conta.agencia,
    numero: conta.numero,
    chavePix: conta.chavePix,
    cartaoFinal: conta.cartaoFinal,
    cartaoBloqueado: conta.cartaoBloqueado,
  };
}

function paraGateway(conta: Conta) {
  return {
    agencia: conta.agencia,
    numero: conta.numero,
    chavePix: conta.chavePix,
    nome: conta.nome,
  };
}

function comSaldo(resposta: RespostaGateway, extra: Partial<ResultadoOperacao> = {}): ResultadoOperacao {
  if (!resposta.ok) {
    return {
      ...extra,
      ok: false,
      motivo: resposta.motivo,
      saldo: resposta.saldoCentavos === undefined ? undefined : reaisDe(resposta.saldoCentavos),
    };
  }
  return {
    ...extra,
    ok: true,
    saldo: reaisDe(resposta.saldoCentavos),
    endToEndId: resposta.endToEndId,
    extrato: resposta.extrato?.slice(-10).map((item) => ({
      em: item.em,
      tipo: item.tipo,
      valor: reaisDe(item.valorCentavos),
      descricao: item.descricao,
    })),
  };
}

async function contaPorNumero(kv: HostKvApi, numero: string): Promise<Conta | undefined> {
  const chatId = await kv.get(chaveContaNumero(numero));
  if (typeof chatId !== "string") return undefined;
  return lerConta(kv, chatId);
}

export async function operarConta(
  kv: HostKvApi,
  chatId: string | undefined,
  sessionId: string,
  pedido: PedidoConta,
): Promise<ResultadoOperacao> {
  if (chatId === undefined) return { ok: false, motivo: "sem_conta" };
  const chave = chaveOperacao(sessionId, pedido);
  if (pedido.acao !== "resumo" && pedido.acao !== "extrato") {
    const repetida = comoRegistro(await kv.get(chave));
    if (repetida?.ok === true || repetida?.ok === false) {
      if (repetida.motivo !== "gateway_pendente" && repetida.motivo !== "gateway_indisponivel") {
        return repetida as ResultadoOperacao;
      }
    }
  }
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return { ok: false, motivo: "sem_conta" };

  if (pedido.acao === "resumo") {
    const dinheiro = comSaldo(await consultarSaldo(paraGateway(conta)));
    if (dinheiro.ok) return { ...dinheiro, conta: perfil(conta) };
    return { ok: true, motivo: dinheiro.motivo, conta: perfil(conta) };
  }
  if (pedido.acao === "extrato") {
    return comSaldo(await consultarSaldo(paraGateway(conta)));
  }

  const resultado = await executar(kv, conta, pedido, chave);
  if (resultado.motivo !== "gateway_pendente" && resultado.motivo !== "gateway_indisponivel") {
    await kv.put(chave, resultado);
  }
  return resultado;
}

function chavePixValida(chave: string): boolean {
  if (/^lb\d{8}@linhabank$/.test(chave)) return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)) return true;
  if (/^\+55\d{10,11}$/.test(chave)) return true;
  if (/^\d{11}$/.test(chave) || /^\d{14}$/.test(chave)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave);
}

async function executar(
  kv: HostKvApi,
  conta: Conta,
  pedido: PedidoConta,
  idOperacao: string,
): Promise<ResultadoOperacao> {
  if (pedido.acao === "bloquear_cartao" || pedido.acao === "desbloquear_cartao") {
    const bloquear = pedido.acao === "bloquear_cartao";
    if (conta.cartaoBloqueado === bloquear) {
      return { ok: true, inalterado: true, conta: perfil(conta) };
    }
    conta.cartaoBloqueado = bloquear;
    await gravarConta(kv, conta);
    return { ok: true, conta: perfil(conta) };
  }

  const centavos = centavosDe(pedido.valor);
  if (centavos === undefined) return { ok: false, motivo: "valor_invalido" };

  if (pedido.acao === "pagar_boleto") {
    const descricao = (pedido.descricao ?? "Boleto").replace(/\s+/g, " ").trim().slice(0, 80);
    if (descricao.length < 3) return { ok: false, motivo: "destino_invalido" };
    const resposta = await pagarBoletoGateway(paraGateway(conta), idOperacao, centavos, descricao);
    return { ...comSaldo(resposta, { valor: reaisDe(centavos), destino: descricao }), conta: perfil(conta) };
  }

  if (pedido.acao === "enviar_pix") {
    const destinoChave = (pedido.chavePix ?? "").trim().toLowerCase();
    if (!chavePixValida(destinoChave)) return { ok: false, motivo: "chave_ausente" };
    if (destinoChave === conta.chavePix) return { ok: false, motivo: "mesmo_cliente" };
    const resposta = await enviarPixGateway(paraGateway(conta), idOperacao, centavos, destinoChave);
    return { ...comSaldo(resposta, { valor: reaisDe(centavos), destino: destinoChave }), conta: perfil(conta) };
  }

  if (pedido.acao === "transferir") {
    const numero = (pedido.conta ?? "").replace(/\D/g, "");
    if (!/^\d{8}$/.test(numero)) return { ok: false, motivo: "conta_ausente" };
    const destino = await contaPorNumero(kv, numero);
    if (destino === undefined) return { ok: false, motivo: "destino_invalido" };
    if (destino.chatId === conta.chatId) return { ok: false, motivo: "mesmo_cliente" };
    const resposta = await transferirGateway(paraGateway(conta), paraGateway(destino), idOperacao, centavos);
    return { ...comSaldo(resposta, { valor: reaisDe(centavos), destino: numero }), conta: perfil(conta) };
  }

  return { ok: false, motivo: "sem_conta" };
}

export type AvisoPix = {
  id: string;
  conta: string;
  valorCentavos: number;
  pagador?: string;
  endToEndId?: string;
};

export async function prepararAvisoPix(
  kv: HostKvApi,
  aviso: AvisoPix,
): Promise<{ estado: "novo"; chatId: string; texto: string } | { estado: "repetido" | "conta_ausente" | "valor_invalido" }> {
  if (!Number.isSafeInteger(aviso.valorCentavos) || aviso.valorCentavos <= 0) {
    return { estado: "valor_invalido" };
  }
  const visto = await kv.get(`linhabank:pix-in:${aviso.id}`);
  if (visto !== undefined) return { estado: "repetido" };
  const destino = await contaPorNumero(kv, aviso.conta);
  if (destino === undefined) return { estado: "conta_ausente" };
  const origem = aviso.pagador === undefined || aviso.pagador.trim().length === 0 ? "" : `, vindo de ${aviso.pagador.trim().slice(0, 80)}`;
  const comprovante = aviso.endToEndId === undefined ? "" : ` Comprovante ${aviso.endToEndId.slice(0, 40)}.`;
  return {
    estado: "novo",
    chatId: destino.chatId,
    texto: `A gateway avisou um PIX de ${reaisDe(aviso.valorCentavos)} na sua conta${origem}.${comprovante} O saldo oficial é o que ela guarda. Quer que eu consulte?`,
  };
}

export async function confirmarAvisoPix(kv: HostKvApi, id: string): Promise<void> {
  await kv.put(`linhabank:pix-in:${id}`, true);
}
