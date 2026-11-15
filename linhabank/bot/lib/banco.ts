import { createHash, randomBytes, randomInt } from "node:crypto";

import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { enviarPixGateway, gatewayConfigurada } from "./gateway.js";

export const TERMOS_VERSAO = "2026-11-15";
export const AGENCIA = "0001";
const MAX_CENTAVOS = 500_000;
const MAX_EXTRATO = 20;

export type Movimento = {
  id: string;
  tipo: "pix_enviado" | "pix_recebido" | "boleto" | "transferencia_enviada" | "transferencia_recebida";
  valorCentavos: number;
  descricao: string;
  em: string;
};

export type Conta = {
  chatId: string;
  nome: string;
  termosVersao: string;
  aceitouEm: string;
  agencia: string;
  numero: string;
  chaveInterna: string;
  referencia: string;
  saldoCentavos: number;
  cartaoFinal: string;
  cartaoBloqueado: boolean;
  extrato: Movimento[];
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
    chaveTransferencia: string;
    cartaoFinal: string;
    cartaoBloqueado: boolean;
  };
  extrato?: { em: string; tipo: string; valor: string; descricao: string }[];
};

export const TEXTO_TERMOS = [
  "Opa, eu sou a Thialinha.",
  "",
  "Pra eu abrir a sua conta no LinhaBank, você precisa concordar com os termos:",
  "",
  "1. A conta é sua. Agência, número e chave interna servem para transferência entre contas LinhaBank.",
  "2. O saldo e o extrato ficam no LinhaBank.",
  "3. PIX para fora sai pela gateway, e PIX recebido entra por ela. Sem a gateway, o PIX não sai nem entra.",
  "4. Boleto e transferência entre contas LinhaBank movem o saldo daqui.",
  "5. Eu não peço senha, código, CVV nem o número completo do cartão.",
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

function chaveContaInterna(chave: string): string {
  return `linhabank:conta:interna:${chave}`;
}

function chaveContaReferencia(referencia: string): string {
  return `linhabank:conta:ref:${referencia}`;
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

function lerMovimento(valor: JsonValue | undefined): Movimento | undefined {
  const item = comoRegistro(valor);
  if (item === undefined) return undefined;
  if (typeof item.id !== "string" || typeof item.tipo !== "string" || typeof item.descricao !== "string") return undefined;
  if (typeof item.valorCentavos !== "number" || typeof item.em !== "string") return undefined;
  if (
    item.tipo !== "pix_enviado" &&
    item.tipo !== "pix_recebido" &&
    item.tipo !== "boleto" &&
    item.tipo !== "transferencia_enviada" &&
    item.tipo !== "transferencia_recebida"
  ) {
    return undefined;
  }
  return {
    id: item.id,
    tipo: item.tipo,
    valorCentavos: item.valorCentavos,
    descricao: item.descricao,
    em: item.em,
  };
}

export function lerContaGravada(valor: JsonValue | undefined): Conta | undefined {
  const item = comoRegistro(valor);
  if (item === undefined) return undefined;
  const chave = typeof item.chaveInterna === "string" ? item.chaveInterna : item.chavePix;
  if (
    typeof item.chatId !== "string" ||
    typeof item.nome !== "string" ||
    typeof item.numero !== "string" ||
    typeof chave !== "string" ||
    typeof item.cartaoFinal !== "string" ||
    typeof item.cartaoBloqueado !== "boolean"
  ) {
    return undefined;
  }
  const extrato: Movimento[] = [];
  if (Array.isArray(item.extrato)) {
    for (const movimento of item.extrato) {
      const lido = lerMovimento(movimento);
      if (lido !== undefined) extrato.push(lido);
    }
  }
  const saldo = typeof item.saldoCentavos === "number" && Number.isSafeInteger(item.saldoCentavos) ? item.saldoCentavos : 0;
  return {
    chatId: item.chatId,
    nome: item.nome,
    termosVersao: typeof item.termosVersao === "string" ? item.termosVersao : TERMOS_VERSAO,
    aceitouEm: typeof item.aceitouEm === "string" ? item.aceitouEm : "",
    agencia: AGENCIA,
    numero: item.numero,
    chaveInterna: chave,
    referencia: typeof item.referencia === "string" ? item.referencia : "",
    saldoCentavos: saldo,
    cartaoFinal: item.cartaoFinal,
    cartaoBloqueado: item.cartaoBloqueado,
    extrato,
  };
}

async function gravarConta(kv: HostKvApi, conta: Conta): Promise<void> {
  await kv.put(chaveContaChat(conta.chatId), conta);
  await kv.put(chaveContaNumero(conta.numero), conta.chatId);
  await kv.put(chaveContaInterna(conta.chaveInterna), conta.chatId);
  await kv.put(chaveContaReferencia(conta.referencia), conta.chatId);
}

export async function lerConta(kv: HostKvApi, chatId: string): Promise<Conta | undefined> {
  const conta = lerContaGravada(await kv.get(chaveContaChat(chatId)));
  if (conta === undefined) return undefined;
  if (conta.referencia.length > 0) return conta;
  conta.referencia = novaReferencia();
  await gravarConta(kv, conta);
  return conta;
}

function novoNumero(): string {
  return String(10_000_000 + randomInt(90_000_000));
}

function novoFinalCartao(): string {
  return String(randomInt(10_000)).padStart(4, "0");
}

function novaReferencia(): string {
  return `ref${randomBytes(8).toString("hex")}`;
}

function novoId(): string {
  return randomInt(1_000_000_000).toString(36);
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
    chaveInterna: `lb${numero}@linhabank`,
    referencia: novaReferencia(),
    saldoCentavos: 0,
    cartaoFinal: novoFinalCartao(),
    cartaoBloqueado: false,
    extrato: [],
  };
  await gravarConta(kv, conta);
  return conta;
}

function perfil(conta: Conta): ResultadoOperacao["conta"] {
  return {
    agencia: conta.agencia,
    numero: conta.numero,
    chaveTransferencia: conta.chaveInterna,
    cartaoFinal: conta.cartaoFinal,
    cartaoBloqueado: conta.cartaoBloqueado,
  };
}

function lancar(conta: Conta, tipo: Movimento["tipo"], valorCentavos: number, descricao: string): void {
  conta.extrato.push({
    id: novoId(),
    tipo,
    valorCentavos,
    descricao: descricao.slice(0, 80),
    em: new Date().toISOString(),
  });
  if (conta.extrato.length > MAX_EXTRATO) {
    conta.extrato.splice(0, conta.extrato.length - MAX_EXTRATO);
  }
}

function extratoDe(conta: Conta): ResultadoOperacao["extrato"] {
  return conta.extrato.slice(-10).map((item) => ({
    em: item.em,
    tipo: item.tipo,
    valor: reaisDe(item.valorCentavos),
    descricao: item.descricao,
  }));
}

async function contaPorChat(kv: HostKvApi, chave: string): Promise<Conta | undefined> {
  const chatId = await kv.get(chave);
  if (typeof chatId !== "string") return undefined;
  return lerConta(kv, chatId);
}

function destinoInterno(chave: string): boolean {
  return /^lb\d{8}@linhabank$/.test(chave) || /^\d{8}$/.test(chave);
}

function chaveExternaValida(chave: string): boolean {
  if (destinoInterno(chave)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(chave)) return true;
  if (/^\+55\d{10,11}$/.test(chave)) return true;
  if (/^\d{11}$/.test(chave) || /^\d{14}$/.test(chave)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave);
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
    return { ok: true, saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }
  if (pedido.acao === "extrato") {
    return { ok: true, saldo: reaisDe(conta.saldoCentavos), extrato: extratoDe(conta) };
  }

  const resultado = await executar(kv, conta, pedido, chave);
  if (resultado.motivo !== "gateway_pendente" && resultado.motivo !== "gateway_indisponivel") {
    await kv.put(chave, resultado);
  }
  return resultado;
}

async function executar(
  kv: HostKvApi,
  conta: Conta,
  pedido: PedidoConta,
  idOperacao: string,
): Promise<ResultadoOperacao> {
  if (pedido.acao === "bloquear_cartao" || pedido.acao === "desbloquear_cartao") {
    const bloquear = pedido.acao === "bloquear_cartao";
    if (conta.cartaoBloqueado === bloquear) return { ok: true, inalterado: true, saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
    conta.cartaoBloqueado = bloquear;
    await gravarConta(kv, conta);
    return { ok: true, saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }

  const centavos = centavosDe(pedido.valor);
  if (centavos === undefined) return { ok: false, motivo: "valor_invalido", saldo: reaisDe(conta.saldoCentavos) };

  if (pedido.acao === "pagar_boleto") {
    const descricao = (pedido.descricao ?? "Boleto").replace(/\s+/g, " ").trim().slice(0, 80);
    if (descricao.length < 3) return { ok: false, motivo: "destino_invalido", saldo: reaisDe(conta.saldoCentavos) };
    if (conta.saldoCentavos < centavos) return { ok: false, motivo: "saldo_insuficiente", saldo: reaisDe(conta.saldoCentavos) };
    conta.saldoCentavos -= centavos;
    lancar(conta, "boleto", -centavos, descricao);
    await gravarConta(kv, conta);
    return { ok: true, valor: reaisDe(centavos), destino: descricao, saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }

  if (pedido.acao === "enviar_pix") return enviarPix(kv, conta, centavos, pedido.chavePix, idOperacao);
  if (pedido.acao === "transferir") return transferir(kv, conta, centavos, pedido.conta ?? pedido.chavePix);
  return { ok: false, motivo: "sem_conta" };
}

async function enviarPix(
  kv: HostKvApi,
  conta: Conta,
  centavos: number,
  chaveInformada: string | undefined,
  idOperacao: string,
): Promise<ResultadoOperacao> {
  const destino = (chaveInformada ?? "").trim().toLowerCase();
  if (destinoInterno(destino)) {
    return { ok: false, motivo: "destino_interno", saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }
  if (!chaveExternaValida(destino)) {
    return { ok: false, motivo: "chave_ausente", saldo: reaisDe(conta.saldoCentavos) };
  }
  if (!gatewayConfigurada()) {
    return { ok: false, motivo: "gateway_pendente", saldo: reaisDe(conta.saldoCentavos) };
  }

  const reservaChave = `linhabank:pix-out:${idOperacao}`;
  let reserva = comoRegistro(await kv.get(reservaChave));
  if (reserva?.status === "enviado" && typeof reserva.endToEndId === "string") {
    const atual = (await lerConta(kv, conta.chatId)) ?? conta;
    return {
      ok: true,
      valor: reaisDe(centavos),
      destino,
      saldo: reaisDe(atual.saldoCentavos),
      endToEndId: reserva.endToEndId,
      conta: perfil(atual),
    };
  }
  if (reserva?.debitado !== true) {
    const atual = (await lerConta(kv, conta.chatId)) ?? conta;
    if (atual.saldoCentavos < centavos) {
      return { ok: false, motivo: "saldo_insuficiente", saldo: reaisDe(atual.saldoCentavos) };
    }
    atual.saldoCentavos -= centavos;
    await gravarConta(kv, atual);
    await kv.put(reservaChave, { debitado: true, chatId: atual.chatId });
    conta = atual;
  }

  const resposta = await enviarPixGateway({
    id: idOperacao,
    referencia: conta.referencia,
    valorCentavos: centavos,
    chaveDestino: destino,
  });
  const atual = (await lerConta(kv, conta.chatId)) ?? conta;
  if (!resposta.ok) {
    atual.saldoCentavos += centavos;
    await gravarConta(kv, atual);
    await kv.delete(reservaChave);
    return { ok: false, motivo: resposta.motivo, saldo: reaisDe(atual.saldoCentavos), conta: perfil(atual) };
  }
  lancar(atual, "pix_enviado", -centavos, `PIX para ${destino}`);
  await gravarConta(kv, atual);
  await kv.put(reservaChave, { debitado: true, status: "enviado", endToEndId: resposta.endToEndId });
  return {
    ok: true,
    valor: reaisDe(centavos),
    destino,
    saldo: reaisDe(atual.saldoCentavos),
    endToEndId: resposta.endToEndId,
    conta: perfil(atual),
  };
}

async function transferir(
  kv: HostKvApi,
  conta: Conta,
  centavos: number,
  destinoInformado: string | undefined,
): Promise<ResultadoOperacao> {
  const bruto = (destinoInformado ?? "").trim().toLowerCase();
  const destino = /^lb\d{8}@linhabank$/.test(bruto)
    ? await contaPorChat(kv, chaveContaInterna(bruto))
    : await contaPorChat(kv, chaveContaNumero(bruto.replace(/\D/g, "")));
  if (destino === undefined) return { ok: false, motivo: "destino_invalido", saldo: reaisDe(conta.saldoCentavos) };
  if (destino.chatId === conta.chatId) return { ok: false, motivo: "mesmo_cliente", saldo: reaisDe(conta.saldoCentavos) };
  if (conta.saldoCentavos < centavos) return { ok: false, motivo: "saldo_insuficiente", saldo: reaisDe(conta.saldoCentavos) };
  conta.saldoCentavos -= centavos;
  destino.saldoCentavos += centavos;
  lancar(conta, "transferencia_enviada", -centavos, `Transferência para ${destino.numero}`);
  lancar(destino, "transferencia_recebida", centavos, `Transferência de ${conta.numero}`);
  await gravarConta(kv, conta);
  await gravarConta(kv, destino);
  return {
    ok: true,
    valor: reaisDe(centavos),
    destino: destino.numero,
    saldo: reaisDe(conta.saldoCentavos),
    conta: perfil(conta),
  };
}

export type AvisoPix = {
  id: string;
  referencia: string;
  valorCentavos: number;
  pagador?: string;
  endToEndId?: string;
};

export async function creditarPixRecebido(
  kv: HostKvApi,
  aviso: AvisoPix,
): Promise<{ estado: "novo"; chatId: string; texto: string } | { estado: "repetido" | "conta_ausente" | "valor_invalido" }> {
  if (!Number.isSafeInteger(aviso.valorCentavos) || aviso.valorCentavos <= 0 || aviso.valorCentavos > 100_000_000_000) {
    return { estado: "valor_invalido" };
  }
  const marca = `linhabank:pix-in:${aviso.id}`;
  if ((await kv.get(marca)) !== undefined) return { estado: "repetido" };
  const destino = await contaPorChat(kv, chaveContaReferencia(aviso.referencia));
  if (destino === undefined) return { estado: "conta_ausente" };
  destino.saldoCentavos += aviso.valorCentavos;
  const origem = aviso.pagador?.trim().slice(0, 80) || "PIX recebido";
  lancar(destino, "pix_recebido", aviso.valorCentavos, origem);
  await gravarConta(kv, destino);
  await kv.put(marca, true);
  const comprovante = aviso.endToEndId === undefined ? "" : ` Comprovante ${aviso.endToEndId.slice(0, 40)}.`;
  return {
    estado: "novo",
    chatId: destino.chatId,
    texto: `Entrou um PIX de ${reaisDe(aviso.valorCentavos)} na sua conta. Seu saldo agora é ${reaisDe(destino.saldoCentavos)}.${comprovante} Quer ver o extrato?`,
  };
}
