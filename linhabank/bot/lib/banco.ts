import { createHash, randomBytes, randomInt } from "node:crypto";

import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { chaveQrAsaas } from "./asaas.js";
import { avisarCanalMovimento } from "./canal.js";
import { hashPayload, novoTxid } from "./brcode.js";
import { sqlDisponivel } from "./db.js";
import { gatewayConfigurada } from "./gateway.js";
import { pspAtual } from "./psp.js";
import { respostaPixRecebido } from "./respostas.js";
import {
  aplicarAtomico,
  extratoLedger,
  gravarCobranca,
  lerCobranca,
  lerCobrancaPorTxid,
  listarCobrancas,
  listarChatIds,
  listarLedger,
  registrarIndiceConta,
} from "./store-kv.js";
import {
  aplicarSql,
  extratoSql,
  gravarCobrancaSql,
  lerContaSql,
  lerCobrancaSql,
  lerCobrancaTxidSql,
  chatIdPorChaveInternaSql,
  chatIdPorNumeroSql,
  listarCobrancasSql,
  listarChatIdsSql,
  listarContasSql,
  listarLedgerSql,
  upsertContaSql,
} from "./store-sql.js";
import { garantirConfig, configAtual } from "./config.js";
import { depositoComTaxa, taxaPixExternoCentavos, taxaPixExternoRecebimentoCentavos } from "./taxa.js";

export const TERMOS_VERSAO = "2026-11-15-2";
export const AGENCIA = "0001";

export function contaInativa(status: string | undefined): boolean {
  return status === "bloqueada" || status === "desativada";
}

export function statusDaConta(valor: unknown): "ativa" | "desativada" {
  return valor === "bloqueada" || valor === "desativada" ? "desativada" : "ativa";
}

export type TipoMovimento =
  | "pix_enviado"
  | "pix_recebido"
  | "boleto"
  | "transferencia_enviada"
  | "transferencia_recebida"
  | "taxa"
  | "deposito"
  | "estorno"
  | "cofrinho_guardar"
  | "cofrinho_resgatar";

export type Movimento = {
  id: string;
  tipo: TipoMovimento;
  valorCentavos: number;
  descricao: string;
  em: string;
  comprovante?: string;
};

export type Lancamento = Movimento & {
  chatId: string;
  contraChatId?: string;
  idempotencyKey: string;
};

export type Cobranca = {
  id: string;
  chatId: string;
  valorCentavos: number;
  taxaCentavos?: number;
  txid: string;
  copiaECola: string;
  status: "aberta" | "paga" | "expirada" | "cancelada";
  provedor: string;
  webhookId?: string;
  endToEndId?: string;
  comprovante?: string;
  criadaEm: string;
  pagaEm?: string;
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
  status: "ativa" | "desativada";
  versao: number;
  extrato: Movimento[];
};

export type PatchContaAdmin = {
  nome?: string;
  agencia?: string;
  numero?: string;
  chaveInterna?: string;
  cartaoFinal?: string;
  status?: "ativa" | "desativada";
};

export type ResultadoEdicaoConta =
  | { ok: true; conta: Conta; alterado: (keyof PatchContaAdmin)[] }
  | { ok: false; motivo: "sem_conta" | "valor_invalido" | "numero_em_uso" | "chave_em_uso" };

export type ResumoConta = {
  aberta: boolean;
  acabouDeAbrir: boolean;
};

export type PedidoConta = {
  acao:
    | "resumo"
    | "extrato"
    | "consultar_chave"
    | "enviar_pix"
    | "transferir"
    | "pagar_boleto"
    | "depositar"
    | "bloquear_cartao"
    | "desbloquear_cartao";
  valor?: string;
  chavePix?: string;
  conta?: string;
  descricao?: string;
  origem?: "agendado";
};

export type ResultadoOperacao = {
  ok: boolean;
  motivo?: string;
  saldo?: string;
  valor?: string;
  destino?: string;
  endToEndId?: string;
  comprovante?: string;
  taxa?: string;
  liquido?: string;
  interno?: boolean;
  nome?: string;
  copiaECola?: string;
  txid?: string;
  qrPng?: string;
  avisoDestino?: { chatId: string; texto: string };
  inalterado?: boolean;
  conta?: {
    agencia: string;
    numero: string;
    chaveTransferencia: string;
    cartaoFinal: string;
    cartaoBloqueado: boolean;
  };
  extrato?: { em: string; tipo: string; valor: string; descricao: string; comprovante?: string }[];
};

export const TEXTO_TERMOS = [
  "Termos de abertura de conta LinhaBank",
  "",
  "A conta só é aberta com a sua concordância.",
  "",
  "1. A conta é individual e de sua titularidade.",
  "2. Agência, número da conta e chave de transferência identificam a sua conta nas movimentações entre clientes LinhaBank.",
  "3. Saldo, extrato, PIX, PIX agendado, transferência, pagamento de boleto, cartão virtual e cofrinho são serviços desta conta.",
  "4. Neste atendimento não são solicitados senha, código de verificação, CVV nem o número completo do cartão.",
  "5. O uso da conta observa a legislação aplicável. O LinhaBank pode recusar uma operação ou encerrar a conta em caso de uso irregular.",
  "6. O PIX agendado, depois de confirmado neste atendimento, é enviado automaticamente no horário definido, até que seja cancelado.",
  "7. PIX entre contas LinhaBank, identificado pela chave da conta, não tem taxa. PIX para outras instituições pode ter taxa, informada antes da confirmação.",
  "8. Depósito via PIX só entra no saldo depois da confirmação do pagamento. Foto ou texto de comprovante enviado neste chat não credita valor.",
  "9. O cofrinho separa um valor do saldo disponível. Não tem taxa nem rendimento. O PIX usa só o que ficou disponível. Resgatar devolve o valor para a conta.",
  "",
  "Para abrir a conta, toque em Concordo ou responda CONCORDO.",
].join("\n");

export const TEXTO_RECUSA =
  "A conta não foi aberta. A abertura depende da concordância com os termos. Quando desejar, envie /start.";

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
  const achado = continuationKey.match(/^tg:(\d{1,16}):\d+$/);
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
  if (!Number.isSafeInteger(total) || total <= 0 || total > configAtual().limiteCentavos) return undefined;
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
    .update(
      JSON.stringify([
        pedido.acao,
        pedido.valor ?? "",
        pedido.chavePix ?? "",
        pedido.conta ?? "",
        pedido.descricao ?? "",
        pedido.origem ?? "",
      ]),
    )
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
    item.tipo !== "transferencia_recebida" &&
    item.tipo !== "taxa" &&
    item.tipo !== "deposito" &&
    item.tipo !== "estorno"
  ) {
    return undefined;
  }
  return {
    id: item.id,
    tipo: item.tipo,
    valorCentavos: item.valorCentavos,
    descricao: item.descricao,
    em: item.em,
    comprovante: typeof item.comprovante === "string" ? item.comprovante : undefined,
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
    agencia: agenciaDaConta(item.agencia),
    numero: item.numero,
    chaveInterna: chave,
    referencia: typeof item.referencia === "string" ? item.referencia : "",
    saldoCentavos: saldo,
    cartaoFinal: item.cartaoFinal,
    cartaoBloqueado: item.cartaoBloqueado,
    status: statusDaConta(item.status),
    versao: typeof item.versao === "number" && Number.isSafeInteger(item.versao) ? item.versao : 1,
    extrato,
  };
}

async function gravarConta(
  kv: HostKvApi,
  conta: Conta,
  anterior?: { numero: string; chaveInterna: string },
): Promise<void> {
  if (anterior !== undefined && anterior.numero !== conta.numero) {
    await soltarIndice(kv, chaveContaNumero(anterior.numero), conta.chatId);
  }
  if (anterior !== undefined && anterior.chaveInterna !== conta.chaveInterna) {
    await soltarIndice(kv, chaveContaInterna(anterior.chaveInterna), conta.chatId);
  }
  await kv.put(chaveContaChat(conta.chatId), conta);
  await kv.put(chaveContaNumero(conta.numero), conta.chatId);
  await kv.put(chaveContaInterna(conta.chaveInterna), conta.chatId);
  await kv.put(chaveContaReferencia(conta.referencia), conta.chatId);
  await registrarIndiceConta(kv, conta.chatId);
  if (sqlDisponivel()) await upsertContaSql(conta);
}

async function soltarIndice(kv: HostKvApi, chave: string, chatId: string): Promise<void> {
  const dono = await kv.get(chave);
  if (dono === chatId) await kv.delete(chave);
}

export async function lerConta(kv: HostKvApi, chatId: string): Promise<Conta | undefined> {
  if (sqlDisponivel()) {
    const sqlConta = await lerContaSql(chatId);
    if (sqlConta !== undefined) return sqlConta;
  }
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
    status: "ativa",
    versao: 1,
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

function resumoCanal(conta: Conta): { nome: string; numero: string; agencia: string } {
  return { nome: conta.nome, numero: conta.numero, agencia: conta.agencia };
}

function extratoDe(itens: Movimento[]): ResultadoOperacao["extrato"] {
  return itens.slice(-30).map((item) => ({
    em: item.em,
    tipo: item.tipo,
    valor: reaisDe(item.valorCentavos),
    descricao: item.descricao,
    comprovante: item.comprovante,
  }));
}

async function historico(kv: HostKvApi, conta: Conta): Promise<Movimento[]> {
  if (sqlDisponivel()) return extratoSql(conta.chatId, 50);
  const ledger = await extratoLedger(kv, conta.chatId, 50);
  return ledger.length > 0 ? ledger : conta.extrato.slice(-50);
}

async function aplicar(
  kv: HostKvApi,
  chatIds: string[],
  idempotencyKey: string,
  movimentos: { chatId: string; tipo: TipoMovimento; valorCentavos: number; descricao: string; contraChatId?: string }[],
  pote?: {
    id: string;
    chatId: string;
    deltaCentavos: number;
    carregar: (id: string) => Promise<{ chatId: string; saldoCentavos: number; status: "ativo" | "encerrado" } | undefined>;
    gravarSaldo: (id: string, saldoCentavos: number) => Promise<void>;
  },
): Promise<{ ok: true; contas: Conta[]; comprovante: string } | { ok: false; motivo: string; contas: Conta[] }> {
  if (sqlDisponivel()) {
    const sqlResultado = await aplicarSql({
      idempotencyKey,
      chatIds,
      movimentos,
      pote: pote === undefined ? undefined : { id: pote.id, chatId: pote.chatId, deltaCentavos: pote.deltaCentavos },
    });
    const contas: Conta[] = [];
    for (const id of chatIds) {
      const conta = await lerConta(kv, id);
      if (conta !== undefined) contas.push(conta);
    }
    if (sqlResultado.ok) {
      for (const conta of contas) await gravarConta(kv, conta);
      return { ok: true, contas, comprovante: sqlResultado.comprovante };
    }
    return { ok: false, motivo: sqlResultado.motivo, contas };
  }
  return aplicarAtomico(kv, {
    idempotencyKey,
    chatIds,
    movimentos,
    carregar: (chatId) => lerConta(kv, chatId),
    gravarConta: (conta) => gravarConta(kv, conta),
    potes:
      pote === undefined
        ? undefined
        : {
            ajustes: [{ id: pote.id, chatId: pote.chatId, deltaCentavos: pote.deltaCentavos }],
            carregar: pote.carregar,
            gravarSaldo: pote.gravarSaldo,
          },
  });
}

export async function reservarEntreContaEPote(
  kv: HostKvApi,
  pedido: {
    idempotencyKey: string;
    chatId: string;
    centavos: number;
    direcao: "guardar" | "resgatar";
    descricao: string;
    poteId: string;
    carregarPote: (id: string) => Promise<{ chatId: string; saldoCentavos: number; status: "ativo" | "encerrado" } | undefined>;
    gravarSaldoPote: (id: string, saldoCentavos: number) => Promise<void>;
  },
): Promise<{ ok: true; saldoCentavos: number; comprovante: string } | { ok: false; motivo: string }> {
  if (!Number.isSafeInteger(pedido.centavos) || pedido.centavos < 1 || pedido.centavos > 100_000_000) {
    return { ok: false, motivo: "valor_invalido" };
  }
  const conta = await lerConta(kv, pedido.chatId);
  if (conta === undefined) return { ok: false, motivo: "sem_conta" };
  if (pedido.direcao === "guardar" && contaInativa(conta.status)) return { ok: false, motivo: "conta_bloqueada" };
  const delta = pedido.direcao === "guardar" ? pedido.centavos : -pedido.centavos;
  const resultado = await aplicar(
    kv,
    [pedido.chatId],
    pedido.idempotencyKey,
    [
      {
        chatId: pedido.chatId,
        tipo: pedido.direcao === "guardar" ? "cofrinho_guardar" : "cofrinho_resgatar",
        valorCentavos: -delta,
        descricao: pedido.descricao,
      },
    ],
    {
      id: pedido.poteId,
      chatId: pedido.chatId,
      deltaCentavos: delta,
      carregar: pedido.carregarPote,
      gravarSaldo: pedido.gravarSaldoPote,
    },
  );
  if (!resultado.ok) return { ok: false, motivo: resultado.motivo };
  const atual = resultado.contas.find((item) => item.chatId === pedido.chatId);
  return { ok: true, saldoCentavos: atual?.saldoCentavos ?? 0, comprovante: resultado.comprovante };
}

async function contaPorChat(kv: HostKvApi, chave: string): Promise<Conta | undefined> {
  const chatId = await kv.get(chave);
  if (typeof chatId !== "string") return undefined;
  return lerConta(kv, chatId);
}

function destinoInterno(chave: string): boolean {
  return /^lb\d{8}@linhabank$/.test(chave) || /^\d{8}$/.test(chave);
}

export function classificarChavePix(chave: string): "externa" | "interna" | "invalida" {
  const destino = chave.trim().toLowerCase();
  if (destino.length === 0 || destinoInterno(destino)) {
    return destino.length === 0 ? "invalida" : "interna";
  }
  return chaveExternaValida(destino) ? "externa" : "invalida";
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
  await garantirConfig(kv);
  const chave = chaveOperacao(sessionId, pedido);
  if (pedido.acao !== "resumo" && pedido.acao !== "extrato" && pedido.acao !== "consultar_chave") {
    const repetida = comoRegistro(await kv.get(chave));
    if (repetida?.ok === true || repetida?.ok === false) {
      if (repetida.motivo !== "gateway_pendente" && repetida.motivo !== "gateway_indisponivel") {
        return repetida as ResultadoOperacao;
      }
    }
  }
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return { ok: false, motivo: "sem_conta" };

  if (contaInativa(conta.status) && pedido.acao !== "resumo" && pedido.acao !== "extrato" && pedido.acao !== "consultar_chave") {
    return { ok: false, motivo: "conta_bloqueada", saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }

  if (pedido.acao === "resumo") {
    return { ok: true, saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }
  if (pedido.acao === "extrato") {
    return { ok: true, saldo: reaisDe(conta.saldoCentavos), extrato: extratoDe(await historico(kv, conta)), conta: perfil(conta) };
  }

  const resultado = await executar(kv, conta, pedido, chave);
  if (resultado.motivo !== "gateway_pendente" && resultado.motivo !== "gateway_indisponivel") {
    await kv.put(chave, semAviso(resultado));
  }
  return resultado;
}

function semAviso(resultado: ResultadoOperacao): ResultadoOperacao {
  if (resultado.avisoDestino === undefined) return resultado;
  const copia: ResultadoOperacao = { ...resultado };
  delete copia.avisoDestino;
  return copia;
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

  if (pedido.acao === "consultar_chave") return consultarChave(kv, conta, pedido);

  const centavos = centavosDe(pedido.valor);
  if (centavos === undefined) return { ok: false, motivo: "valor_invalido", saldo: reaisDe(conta.saldoCentavos) };

  if (pedido.acao === "pagar_boleto") {
    const descricao = (pedido.descricao ?? "Boleto").replace(/\s+/g, " ").trim().slice(0, 80);
    if (descricao.length < 3) return { ok: false, motivo: "destino_invalido", saldo: reaisDe(conta.saldoCentavos) };
    const movimento = await aplicar(kv, [conta.chatId], idOperacao, [
      { chatId: conta.chatId, tipo: "boleto", valorCentavos: -centavos, descricao },
    ]);
    const atual = movimento.contas.find((item) => item.chatId === conta.chatId) ?? conta;
    if (!movimento.ok) {
      return { ok: false, motivo: movimento.motivo, saldo: reaisDe(atual.saldoCentavos), conta: perfil(atual) };
    }
    return {
      ok: true,
      valor: reaisDe(centavos),
      destino: descricao,
      saldo: reaisDe(atual.saldoCentavos),
      comprovante: movimento.comprovante,
      conta: perfil(atual),
    };
  }

  if (pedido.acao === "depositar") return criarDeposito(kv, conta, centavos, idOperacao);
  if (pedido.acao === "enviar_pix") {
    return enviarPix(kv, conta, centavos, pedido.chavePix, idOperacao, pedido.origem === "agendado");
  }
  if (pedido.acao === "transferir") return transferir(kv, conta, centavos, pedido.conta ?? pedido.chavePix, idOperacao);
  return { ok: false, motivo: "sem_conta" };
}

function primeiroNome(nome: string): string {
  const pedaco = nome.trim().split(/\s+/)[0] ?? "";
  return pedaco.slice(0, 40);
}

export async function buscarContaLinhaBank(kv: HostKvApi, chave: string): Promise<Conta | undefined> {
  const destino = chave.trim().toLowerCase();
  if (destino.length === 0) return undefined;
  const porChave = await contaPorChat(kv, chaveContaInterna(destino));
  if (porChave !== undefined) return porChave;
  if (/^\d{8}$/.test(destino)) return contaPorChat(kv, chaveContaNumero(destino));
  return undefined;
}

async function consultarChave(kv: HostKvApi, conta: Conta, pedido: PedidoConta): Promise<ResultadoOperacao> {
  const informada = (pedido.chavePix ?? pedido.conta ?? "").trim();
  const saldo = reaisDe(conta.saldoCentavos);
  const interna = await buscarContaLinhaBank(kv, informada);
  if (interna !== undefined) {
    if (interna.chatId === conta.chatId) return { ok: false, motivo: "mesmo_cliente", saldo, conta: perfil(conta) };
    return {
      ok: true,
      interno: true,
      taxa: "0,00",
      destino: interna.numero,
      nome: primeiroNome(interna.nome),
      saldo,
      conta: perfil(conta),
    };
  }
  const classe = classificarChavePix(informada);
  if (classe === "interna") return { ok: false, motivo: "destino_invalido", saldo, conta: perfil(conta) };
  if (classe !== "externa") return { ok: false, motivo: "chave_ausente", saldo, conta: perfil(conta) };
  const centavos = centavosDe(pedido.valor);
  const taxa = taxaPixExternoCentavos(centavos ?? 0);
  return {
    ok: true,
    interno: false,
    taxa: reaisDe(taxa),
    destino: informada.trim().toLowerCase(),
    saldo,
    conta: perfil(conta),
  };
}

async function enviarPix(
  kv: HostKvApi,
  conta: Conta,
  centavos: number,
  chaveInformada: string | undefined,
  idOperacao: string,
  agendado = false,
): Promise<ResultadoOperacao> {
  const destino = (chaveInformada ?? "").trim().toLowerCase();
  const contaDestino = await buscarContaLinhaBank(kv, destino);
  if (contaDestino !== undefined) {
    return liquidarEntreContas(kv, conta, contaDestino, centavos, idOperacao, "pix");
  }
  const classe = classificarChavePix(destino);
  if (classe === "interna") {
    return { ok: false, motivo: "destino_invalido", saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }
  if (classe !== "externa") {
    return { ok: false, motivo: "chave_ausente", saldo: reaisDe(conta.saldoCentavos) };
  }
  if (!gatewayConfigurada()) {
    return { ok: false, motivo: "gateway_pendente", saldo: reaisDe(conta.saldoCentavos) };
  }

  const reservaChave = `linhabank:pix-out:${idOperacao}`;
  const reserva = comoRegistro(await kv.get(reservaChave));
  const taxaGuardada = typeof reserva?.taxaCentavos === "number" ? reserva.taxaCentavos : taxaPixExternoCentavos(centavos);
  if (reserva?.status === "enviado" && typeof reserva.endToEndId === "string") {
    const atual = (await lerConta(kv, conta.chatId)) ?? conta;
    return {
      ok: true,
      interno: false,
      valor: reaisDe(centavos),
      taxa: reaisDe(taxaGuardada),
      destino,
      saldo: reaisDe(atual.saldoCentavos),
      endToEndId: reserva.endToEndId,
      conta: perfil(atual),
    };
  }
  if (reserva?.debitado !== true) {
    const taxa = taxaPixExternoCentavos(centavos);
    const prefixo = agendado ? "PIX agendado" : "PIX";
    const movimentos: { chatId: string; tipo: TipoMovimento; valorCentavos: number; descricao: string }[] = [
      { chatId: conta.chatId, tipo: "pix_enviado", valorCentavos: -centavos, descricao: `${prefixo} para ${destino}` },
    ];
    if (taxa > 0) movimentos.push({ chatId: conta.chatId, tipo: "taxa", valorCentavos: -taxa, descricao: "Taxa de PIX" });
    const debito = await aplicar(kv, [conta.chatId], idOperacao, movimentos);
    const atual = debito.contas.find((item) => item.chatId === conta.chatId) ?? conta;
    if (!debito.ok) {
      return { ok: false, motivo: debito.motivo, taxa: reaisDe(taxa), saldo: reaisDe(atual.saldoCentavos), conta: perfil(atual) };
    }
    await kv.put(reservaChave, {
      debitado: true,
      chatId: atual.chatId,
      taxaCentavos: taxa,
      valorCentavos: centavos,
      comprovante: debito.comprovante,
    });
    conta = atual;
  }

  const psp = pspAtual();
  const referenciaPsp = idOperacao.length <= 100 ? idOperacao : `op${hashPayload(idOperacao).slice(0, 32)}`;
  await kv.put(`linhabank:asaas:op:${referenciaPsp}`, idOperacao);
  const resposta = await psp.enviar({
    id: referenciaPsp,
    referencia: conta.referencia,
    valorCentavos: centavos,
    chaveDestino: destino,
  });
  const taxaReservada = comoRegistro(await kv.get(reservaChave));
  const taxa =
    taxaReservada?.debitado === true && typeof taxaReservada.taxaCentavos === "number"
      ? taxaReservada.taxaCentavos
      : taxaGuardada;
  if (!resposta.ok) {
    const estorno = await aplicar(kv, [conta.chatId], `${idOperacao}:estorno`, [
      { chatId: conta.chatId, tipo: "estorno", valorCentavos: centavos + taxa, descricao: "Estorno de PIX não enviado" },
    ]);
    await kv.delete(reservaChave);
    const atual = estorno.contas.find((item) => item.chatId === conta.chatId) ?? (await lerConta(kv, conta.chatId)) ?? conta;
    return { ok: false, motivo: resposta.motivo, taxa: reaisDe(taxa), saldo: reaisDe(atual.saldoCentavos), conta: perfil(atual) };
  }
  const reservaEnviado: Record<string, string | number | boolean> = {
    debitado: true,
    status: "enviado",
    endToEndId: resposta.endToEndId,
    taxaCentavos: taxa,
    valorCentavos: centavos,
    chatId: conta.chatId,
  };
  if (typeof taxaReservada?.comprovante === "string") reservaEnviado.comprovante = taxaReservada.comprovante;
  await kv.put(reservaChave, reservaEnviado);
  const atual = (await lerConta(kv, conta.chatId)) ?? conta;
  const comprovante = typeof reservaEnviado.comprovante === "string" ? reservaEnviado.comprovante : undefined;
  await avisarCanalMovimento(kv, {
    id: `pix-out:${idOperacao}`,
    tipo: "pix_enviado",
    conta: resumoCanal(atual),
    valorCentavos: centavos,
    destino,
    interno: false,
    taxaCentavos: taxa,
    comprovante,
  });
  return {
    ok: true,
    interno: false,
    valor: reaisDe(centavos),
    taxa: reaisDe(taxa),
    destino,
    saldo: reaisDe(atual.saldoCentavos),
    endToEndId: resposta.endToEndId,
    comprovante,
    conta: perfil(atual),
  };
}

async function transferir(
  kv: HostKvApi,
  conta: Conta,
  centavos: number,
  destinoInformado: string | undefined,
  idOperacao: string,
): Promise<ResultadoOperacao> {
  const destino = await buscarContaLinhaBank(kv, destinoInformado ?? "");
  if (destino === undefined) return { ok: false, motivo: "destino_invalido", saldo: reaisDe(conta.saldoCentavos) };
  return liquidarEntreContas(kv, conta, destino, centavos, idOperacao, "transferencia");
}

async function liquidarEntreContas(
  kv: HostKvApi,
  conta: Conta,
  destino: Conta,
  centavos: number,
  idOperacao: string,
  modo: "pix" | "transferencia",
): Promise<ResultadoOperacao> {
  const reservaChave = `linhabank:interno:${idOperacao}`;
  const reserva = comoRegistro(await kv.get(reservaChave));
  if (reserva?.status === "enviado" && typeof reserva.destino === "string") {
    const atual = (await lerConta(kv, conta.chatId)) ?? conta;
    return {
      ok: true,
      interno: true,
      taxa: "0,00",
      valor: reaisDe(centavos),
      destino: reserva.destino,
      saldo: reaisDe(atual.saldoCentavos),
      conta: perfil(atual),
    };
  }
  if (destino.chatId === conta.chatId) return { ok: false, motivo: "mesmo_cliente", taxa: "0,00", saldo: reaisDe(conta.saldoCentavos) };
  const debitoTipo = modo === "pix" ? "pix_enviado" : "transferencia_enviada";
  const creditoTipo = modo === "pix" ? "pix_recebido" : "transferencia_recebida";
  const movimento = await aplicar(kv, [conta.chatId, destino.chatId], idOperacao, [
    {
      chatId: conta.chatId,
      tipo: debitoTipo,
      valorCentavos: -centavos,
      descricao: modo === "pix" ? `PIX para conta ${destino.numero}` : `Transferência para ${destino.numero}`,
      contraChatId: destino.chatId,
    },
    {
      chatId: destino.chatId,
      tipo: creditoTipo,
      valorCentavos: centavos,
      descricao: modo === "pix" ? `PIX da conta ${conta.numero}` : `Transferência de ${conta.numero}`,
      contraChatId: conta.chatId,
    },
  ]);
  const origem = movimento.contas.find((item) => item.chatId === conta.chatId) ?? conta;
  const creditada = movimento.contas.find((item) => item.chatId === destino.chatId) ?? destino;
  if (!movimento.ok) {
    return { ok: false, motivo: movimento.motivo, taxa: "0,00", saldo: reaisDe(origem.saldoCentavos), conta: perfil(origem) };
  }
  await kv.put(reservaChave, { status: "enviado", destino: creditada.numero, comprovante: movimento.comprovante });
  const envio = modo === "pix" ? "pix_enviado" : "transferencia_enviada";
  const recebimento = modo === "pix" ? "pix_recebido" : "transferencia_recebida";
  await avisarCanalMovimento(kv, {
    id: `${modo}-out:${idOperacao}`,
    tipo: envio,
    conta: resumoCanal(origem),
    valorCentavos: centavos,
    destino: `${creditada.agencia} / ${creditada.numero}  ·  ${creditada.nome}`,
    interno: true,
    taxaCentavos: 0,
    comprovante: movimento.comprovante,
  });
  await avisarCanalMovimento(kv, {
    id: `${modo}-in:${idOperacao}`,
    tipo: recebimento,
    conta: resumoCanal(creditada),
    valorCentavos: centavos,
    origem: `${origem.agencia} / ${origem.numero}  ·  ${origem.nome}`,
    comprovante: movimento.comprovante,
  });
  return {
    ok: true,
    interno: true,
    taxa: "0,00",
    valor: reaisDe(centavos),
    destino: creditada.numero,
    nome: primeiroNome(creditada.nome),
    saldo: reaisDe(origem.saldoCentavos),
    comprovante: movimento.comprovante,
    conta: perfil(origem),
    avisoDestino: {
      chatId: creditada.chatId,
      texto:
        modo === "pix"
          ? respostaPixRecebido({
              valor: reaisDe(centavos),
              saldo: reaisDe(creditada.saldoCentavos),
              origem: origem.numero,
              comprovante: movimento.comprovante,
            })
          : `Transferência de R$ ${reaisDe(centavos)} recebida da conta ${origem.numero}. Saldo: R$ ${reaisDe(creditada.saldoCentavos)}. Comprovante ${movimento.comprovante}.`,
    },
  };
}

export type AvisoPix = {
  id: string;
  referencia?: string;
  valorCentavos: number;
  pagador?: string;
  endToEndId?: string;
  txid?: string;
  cobrancaId?: string;
  pixQrCodeId?: string;
};

function lancamentosRecebimentoExterno(
  chatId: string,
  valorCentavos: number,
  tipo: "deposito" | "pix_recebido",
  descricao: string,
  taxaInformada?: number,
): { movimentos: { chatId: string; tipo: TipoMovimento; valorCentavos: number; descricao: string }[]; taxa: number } {
  const calculada =
    taxaInformada !== undefined && Number.isSafeInteger(taxaInformada) && taxaInformada >= 0
      ? taxaInformada
      : taxaPixExternoRecebimentoCentavos(valorCentavos);
  const taxa = Math.min(calculada, valorCentavos);
  const movimentos: { chatId: string; tipo: TipoMovimento; valorCentavos: number; descricao: string }[] = [
    { chatId, tipo, valorCentavos, descricao },
  ];
  if (taxa > 0) movimentos.push({ chatId, tipo: "taxa", valorCentavos: -taxa, descricao: "Taxa de PIX recebido" });
  return { movimentos, taxa };
}

export async function creditarPixRecebido(
  kv: HostKvApi,
  aviso: AvisoPix,
): Promise<
  | { estado: "novo"; chatId: string; texto: string }
  | { estado: "repetido" | "conta_ausente" | "valor_invalido" | "valor_divergente" }
> {
  await garantirConfig(kv);
  if (!Number.isSafeInteger(aviso.valorCentavos) || aviso.valorCentavos <= 0 || aviso.valorCentavos > 100_000_000_000) {
    return { estado: "valor_invalido" };
  }
  const marca = `linhabank:pix-in:${aviso.id}`;
  if ((await kv.get(marca)) !== undefined) return { estado: "repetido" };

  const cobranca = await localizarCobranca(kv, aviso);
  if (cobranca !== undefined) {
    if (cobranca.status === "paga") {
      await kv.put(marca, true);
      return { estado: "repetido" };
    }
    if (cobranca.valorCentavos !== aviso.valorCentavos) return { estado: "valor_divergente" };
    const destinoCobranca = await lerConta(kv, cobranca.chatId);
    if (destinoCobranca === undefined) return { estado: "conta_ausente" };
    const lancado = lancamentosRecebimentoExterno(
      destinoCobranca.chatId,
      aviso.valorCentavos,
      "deposito",
      (aviso.pagador?.trim().slice(0, 80) || "Depósito PIX") as string,
      cobranca.taxaCentavos,
    );
    const movimento = await aplicar(kv, [destinoCobranca.chatId], `pix-in:${aviso.id}`, lancado.movimentos);
    if (!movimento.ok) return { estado: "conta_ausente" };
    const atual = movimento.contas.find((item) => item.chatId === destinoCobranca.chatId) ?? destinoCobranca;
    const paga: Cobranca = {
      ...cobranca,
      status: "paga",
      webhookId: aviso.id,
      endToEndId: aviso.endToEndId,
      comprovante: movimento.comprovante,
      pagaEm: new Date().toISOString(),
    };
    await salvarCobranca(kv, paga);
    await kv.put(marca, true);
    const comprovante = movimento.comprovante ?? aviso.endToEndId?.slice(0, 40);
    await avisarCanalMovimento(kv, {
      id: `dep-liq:${aviso.id}`,
      tipo: "deposito_recebido",
      conta: resumoCanal(atual),
      valorCentavos: aviso.valorCentavos,
      comprovante,
      origem: aviso.pagador?.trim().slice(0, 80),
      taxaCentavos: lancado.taxa,
    });
    return {
      estado: "novo",
      chatId: atual.chatId,
      texto: respostaPixRecebido({
        valor: reaisDe(aviso.valorCentavos),
        saldo: reaisDe(atual.saldoCentavos),
        comprovante,
        taxa: lancado.taxa > 0 ? reaisDe(lancado.taxa) : undefined,
      }),
    };
  }

  if (aviso.referencia === undefined) return { estado: "conta_ausente" };
  const destino = await contaPorChat(kv, chaveContaReferencia(aviso.referencia));
  if (destino === undefined) return { estado: "conta_ausente" };
  const lancado = lancamentosRecebimentoExterno(
    destino.chatId,
    aviso.valorCentavos,
    "pix_recebido",
    aviso.pagador?.trim().slice(0, 80) || "PIX recebido",
  );
  const movimento = await aplicar(kv, [destino.chatId], `pix-in:${aviso.id}`, lancado.movimentos);
  if (!movimento.ok) return { estado: "conta_ausente" };
  const atual = movimento.contas.find((item) => item.chatId === destino.chatId) ?? destino;
  await kv.put(marca, true);
  const comprovante = movimento.comprovante ?? aviso.endToEndId?.slice(0, 40);
  await avisarCanalMovimento(kv, {
    id: `pix-in:${aviso.id}`,
    tipo: "pix_recebido",
    conta: resumoCanal(atual),
    valorCentavos: aviso.valorCentavos,
    origem: aviso.pagador?.trim().slice(0, 80),
    comprovante,
    taxaCentavos: lancado.taxa,
  });
  return {
    estado: "novo",
    chatId: atual.chatId,
    texto: respostaPixRecebido({
      valor: reaisDe(aviso.valorCentavos),
      saldo: reaisDe(atual.saldoCentavos),
      comprovante,
      taxa: lancado.taxa > 0 ? reaisDe(lancado.taxa) : undefined,
    }),
  };
}

export async function estornarPixExterno(
  kv: HostKvApi,
  idOperacao: string,
): Promise<{ estado: "novo" | "repetido" | "ausente"; chatId?: string; texto?: string }> {
  const mapeado = await kv.get(`linhabank:asaas:op:${idOperacao}`);
  const operacao = typeof mapeado === "string" ? mapeado : idOperacao;
  const reservaChave = `linhabank:pix-out:${operacao}`;
  const reserva = comoRegistro(await kv.get(reservaChave));
  if (reserva === undefined) return { estado: "ausente" };
  if (reserva.status === "estornado") return { estado: "repetido" };
  if (reserva.debitado !== true) return { estado: "ausente" };
  const chatId = typeof reserva.chatId === "string" ? reserva.chatId : undefined;
  const valorCentavos = typeof reserva.valorCentavos === "number" ? reserva.valorCentavos : 0;
  const taxaCentavos = typeof reserva.taxaCentavos === "number" ? reserva.taxaCentavos : 0;
  if (chatId === undefined || valorCentavos <= 0) return { estado: "ausente" };
  const estorno = await aplicar(kv, [chatId], `${operacao}:estorno`, [
    { chatId, tipo: "estorno", valorCentavos: valorCentavos + taxaCentavos, descricao: "Estorno de PIX não enviado" },
  ]);
  await kv.put(reservaChave, { ...reserva, status: "estornado" });
  const atual = estorno.contas.find((item) => item.chatId === chatId);
  return {
    estado: "novo",
    chatId,
    texto: atual
      ? `PIX não liquidado. Valor devolvido. Saldo: R$ ${reaisDe(atual.saldoCentavos)}.`
      : "PIX não liquidado. Valor devolvido.",
  };
}

async function localizarCobranca(kv: HostKvApi, aviso: AvisoPix): Promise<Cobranca | undefined> {
  if (aviso.cobrancaId !== undefined) {
    return sqlDisponivel() ? lerCobrancaSql(aviso.cobrancaId) : lerCobranca(kv, aviso.cobrancaId);
  }
  if (aviso.txid !== undefined) {
    return sqlDisponivel() ? lerCobrancaTxidSql(aviso.txid) : lerCobrancaPorTxid(kv, aviso.txid);
  }
  if (aviso.pixQrCodeId !== undefined) {
    const id = await kv.get(chaveQrAsaas(aviso.pixQrCodeId));
    if (typeof id === "string") {
      return sqlDisponivel() ? lerCobrancaSql(id) : lerCobranca(kv, id);
    }
  }
  return undefined;
}

async function salvarCobranca(kv: HostKvApi, cobranca: Cobranca): Promise<void> {
  await gravarCobranca(kv, cobranca);
  if (sqlDisponivel()) await gravarCobrancaSql(cobranca);
}

function resultadoDeposito(conta: Conta, cobranca: Cobranca, liquidoCentavos: number, taxaCentavos: number): ResultadoOperacao {
  return {
    ok: true,
    valor: reaisDe(cobranca.valorCentavos),
    taxa: reaisDe(taxaCentavos),
    liquido: reaisDe(liquidoCentavos),
    copiaECola: cobranca.copiaECola,
    txid: cobranca.txid,
    destino: cobranca.id,
    saldo: reaisDe(conta.saldoCentavos),
    conta: perfil(conta),
  };
}

async function criarDeposito(kv: HostKvApi, conta: Conta, centavos: number, idOperacao: string): Promise<ResultadoOperacao> {
  await garantirConfig(kv);
  const { liquidoCentavos, taxaCentavos, cobradoCentavos } = depositoComTaxa(centavos);
  const abertas = sqlDisponivel() ? await listarCobrancasSql(conta.chatId, 10) : await listarCobrancas(kv, conta.chatId, 10);
  const recente = abertas.find(
    (item) => item.status === "aberta" && item.valorCentavos === cobradoCentavos && (item.taxaCentavos ?? 0) === taxaCentavos,
  );
  if (recente !== undefined) return resultadoDeposito(conta, recente, liquidoCentavos, taxaCentavos);
  const txid = novoTxid();
  const cobrancaId = `dep-${hashPayload(idOperacao).slice(0, 16)}`;
  const gerada = await pspAtual().cobranca({ valorCentavos: cobradoCentavos, txid, cobrancaId });
  if ("ok" in gerada) {
    return { ok: false, motivo: "deposito_pendente", saldo: reaisDe(conta.saldoCentavos), conta: perfil(conta) };
  }
  const cobranca: Cobranca = {
    id: cobrancaId,
    chatId: conta.chatId,
    valorCentavos: cobradoCentavos,
    taxaCentavos,
    txid,
    copiaECola: gerada.copiaECola,
    status: "aberta",
    provedor: gerada.provedor,
    criadaEm: new Date().toISOString(),
  };
  await salvarCobranca(kv, cobranca);
  if (gerada.qrId !== undefined) await kv.put(chaveQrAsaas(gerada.qrId), cobranca.id);
  await avisarCanalMovimento(kv, {
    id: `dep-gerado:${cobranca.id}`,
    tipo: "deposito_gerado",
    conta: resumoCanal(conta),
    valorCentavos: cobradoCentavos,
    cobrancaId: cobranca.id,
    taxaCentavos,
  });
  return resultadoDeposito(conta, cobranca, liquidoCentavos, taxaCentavos);
}

export async function bloquearConta(
  kv: HostKvApi,
  chatId: string,
  bloquear: boolean,
): Promise<Conta | undefined> {
  const resultado = await editarContaAdmin(kv, chatId, { status: bloquear ? "desativada" : "ativa" });
  if (resultado.ok) return resultado.conta;
  return lerConta(kv, chatId);
}

export async function editarContaAdmin(
  kv: HostKvApi,
  chatId: string,
  patch: PatchContaAdmin,
): Promise<ResultadoEdicaoConta> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return { ok: false, motivo: "sem_conta" };
  const anterior = { numero: conta.numero, chaveInterna: conta.chaveInterna };
  const proxima: Conta = { ...conta, extrato: [...conta.extrato] };
  const alterado: (keyof PatchContaAdmin)[] = [];

  if (patch.nome !== undefined) {
    const nome = normalizarNomeTitular(patch.nome);
    if (nome === undefined) return { ok: false, motivo: "valor_invalido" };
    if (nome !== proxima.nome) {
      proxima.nome = nome;
      alterado.push("nome");
    }
  }
  if (patch.agencia !== undefined) {
    const agencia = normalizarAgencia(patch.agencia);
    if (agencia === undefined) return { ok: false, motivo: "valor_invalido" };
    if (agencia !== proxima.agencia) {
      proxima.agencia = agencia;
      alterado.push("agencia");
    }
  }
  if (patch.numero !== undefined) {
    const numero = normalizarNumeroConta(patch.numero);
    if (numero === undefined) return { ok: false, motivo: "valor_invalido" };
    if (numero !== proxima.numero) {
      const ocupante = await chatIdDoNumero(kv, numero);
      if (ocupante !== undefined && ocupante !== chatId) return { ok: false, motivo: "numero_em_uso" };
      if (proxima.chaveInterna === `lb${proxima.numero}@linhabank` && patch.chaveInterna === undefined) {
        const novaChave = `lb${numero}@linhabank`;
        const donoChave = await chatIdDaChaveInterna(kv, novaChave);
        if (donoChave !== undefined && donoChave !== chatId) return { ok: false, motivo: "chave_em_uso" };
        proxima.chaveInterna = novaChave;
        alterado.push("chaveInterna");
      }
      proxima.numero = numero;
      alterado.push("numero");
    }
  }
  if (patch.chaveInterna !== undefined) {
    const chave = normalizarChaveInterna(patch.chaveInterna);
    if (chave === undefined) return { ok: false, motivo: "valor_invalido" };
    if (chave !== proxima.chaveInterna) {
      const ocupante = await chatIdDaChaveInterna(kv, chave);
      if (ocupante !== undefined && ocupante !== chatId) return { ok: false, motivo: "chave_em_uso" };
      proxima.chaveInterna = chave;
      if (!alterado.includes("chaveInterna")) alterado.push("chaveInterna");
    }
  }
  if (patch.cartaoFinal !== undefined) {
    const final = normalizarCartaoFinal(patch.cartaoFinal);
    if (final === undefined) return { ok: false, motivo: "valor_invalido" };
    if (final !== proxima.cartaoFinal) {
      proxima.cartaoFinal = final;
      alterado.push("cartaoFinal");
    }
  }
  if (patch.status !== undefined) {
    const status = statusDaConta(patch.status);
    if (status !== proxima.status) {
      proxima.status = status;
      alterado.push("status");
    }
  }

  if (alterado.length > 0) {
    proxima.versao += 1;
    await gravarConta(kv, proxima, anterior);
  }
  return { ok: true, conta: proxima, alterado };
}

async function chatIdDoNumero(kv: HostKvApi, numero: string): Promise<string | undefined> {
  if (sqlDisponivel()) {
    const id = await chatIdPorNumeroSql(numero);
    if (id !== undefined) return id;
  }
  const valor = await kv.get(chaveContaNumero(numero));
  return typeof valor === "string" ? valor : undefined;
}

async function chatIdDaChaveInterna(kv: HostKvApi, chave: string): Promise<string | undefined> {
  if (sqlDisponivel()) {
    const id = await chatIdPorChaveInternaSql(chave);
    if (id !== undefined) return id;
  }
  const valor = await kv.get(chaveContaInterna(chave));
  return typeof valor === "string" ? valor : undefined;
}

function agenciaDaConta(valor: unknown): string {
  return typeof valor === "string" ? (normalizarAgencia(valor) ?? AGENCIA) : AGENCIA;
}

function normalizarNomeTitular(valor: string): string | undefined {
  const nome = valor.trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 64) return undefined;
  if (/[\u0000-\u001f]/.test(nome)) return undefined;
  return nome;
}

function normalizarAgencia(valor: string): string | undefined {
  const digitos = valor.trim().replace(/\D/g, "");
  if (digitos.length < 1 || digitos.length > 4) return undefined;
  return digitos.padStart(4, "0");
}

function normalizarNumeroConta(valor: string): string | undefined {
  const digitos = valor.trim().replace(/\D/g, "");
  return /^\d{8}$/.test(digitos) ? digitos : undefined;
}

function normalizarChaveInterna(valor: string): string | undefined {
  const chave = valor.trim().toLowerCase();
  if (chave.length < 8 || chave.length > 77) return undefined;
  if (/\s/.test(chave)) return undefined;
  return chave;
}

function normalizarCartaoFinal(valor: string): string | undefined {
  const digitos = valor.trim().replace(/\D/g, "");
  return /^\d{4}$/.test(digitos) ? digitos : undefined;
}

export async function bloquearCartaoGerencia(
  kv: HostKvApi,
  chatId: string,
  bloquear: boolean,
): Promise<Conta | undefined> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return undefined;
  conta.cartaoBloqueado = bloquear;
  await gravarConta(kv, conta);
  return conta;
}

export async function cancelarCobrancaAberta(kv: HostKvApi, cobrancaId: string): Promise<Cobranca | undefined> {
  const cobranca = sqlDisponivel() ? await lerCobrancaSql(cobrancaId) : await lerCobranca(kv, cobrancaId);
  if (cobranca === undefined || cobranca.status !== "aberta") return undefined;
  cobranca.status = "cancelada";
  await salvarCobranca(kv, cobranca);
  return cobranca;
}

export type ContaPainel = {
  chatId: string;
  nome: string;
  numero: string;
  agencia: string;
  saldo: string;
  saldoCentavos: number;
  status: string;
  chaveInterna: string;
  cartaoFinal: string;
  cartaoBloqueado: boolean;
  aceitouEm: string;
};

export async function painelCarteira(kv: HostKvApi): Promise<{
  contas: ContaPainel[];
  ledger: { em: string; tipo: string; valor: string; valorCentavos: number; conta: string; comprovante?: string }[];
  cobrancas: {
    id: string;
    chatId: string;
    valor: string;
    valorCentavos: number;
    taxaCentavos: number;
    liquido: string;
    status: string;
    txid: string;
  }[];
  totalCentavos: number;
  sql: boolean;
}> {
  const contas = sqlDisponivel()
    ? await listarContasSql(80)
    : await Promise.all((await listarChatIds(kv)).map((id) => lerConta(kv, id)));
  const vivas = contas.filter((item): item is Conta => item !== undefined);
  const ledger = sqlDisponivel() ? await listarLedgerSql(80) : await listarLedger(kv, 80);
  const cobrancas = sqlDisponivel() ? await listarCobrancasSql(undefined, 40) : await listarCobrancas(kv, undefined, 40);
  return {
    sql: sqlDisponivel(),
    totalCentavos: vivas.reduce((soma, conta) => soma + conta.saldoCentavos, 0),
    contas: vivas.map((conta) => ({
      chatId: conta.chatId,
      nome: conta.nome,
      numero: conta.numero,
      agencia: conta.agencia,
      saldo: reaisDe(conta.saldoCentavos),
      saldoCentavos: conta.saldoCentavos,
      status: conta.status,
      chaveInterna: conta.chaveInterna,
      cartaoFinal: conta.cartaoFinal,
      cartaoBloqueado: conta.cartaoBloqueado,
      aceitouEm: conta.aceitouEm,
    })),
    ledger: ledger.map((item) => ({
      em: item.em,
      tipo: item.tipo,
      valor: reaisDe(item.valorCentavos),
      valorCentavos: item.valorCentavos,
      conta: item.chatId,
      comprovante: item.comprovante,
    })),
    cobrancas: cobrancas.map((item) => ({
      id: item.id,
      chatId: item.chatId,
      valor: reaisDe(item.valorCentavos),
      valorCentavos: item.valorCentavos,
      taxaCentavos: item.taxaCentavos ?? 0,
      liquido: reaisDe(item.valorCentavos - (item.taxaCentavos ?? 0)),
      status: item.status,
      txid: item.txid,
    })),
  };
}

export async function listarChatIdsClientes(kv: HostKvApi, soAtivas = false): Promise<string[]> {
  if (!soAtivas) {
    return sqlDisponivel() ? listarChatIdsSql() : listarChatIds(kv);
  }
  const painel = await painelCarteira(kv);
  return painel.contas.filter((item) => !contaInativa(item.status)).map((item) => item.chatId);
}

export async function confirmarCobrancaSandbox(
  kv: HostKvApi,
  cobrancaId: string,
): Promise<{ estado: "novo"; chatId: string; texto: string } | { estado: "repetido" | "conta_ausente" | "valor_invalido" | "valor_divergente" | "live" }> {
  await garantirConfig(kv);
  const { emSandbox } = await import("./modo.js");
  if (!emSandbox()) return { estado: "live" };
  const cobranca = sqlDisponivel() ? await lerCobrancaSql(cobrancaId) : await lerCobranca(kv, cobrancaId);
  if (cobranca === undefined) return { estado: "conta_ausente" };
  return creditarPixRecebido(kv, {
    id: `sandbox-${cobranca.id}`,
    cobrancaId: cobranca.id,
    txid: cobranca.txid,
    valorCentavos: cobranca.valorCentavos,
    pagador: "Sandbox LinhaBank",
    endToEndId: `E2ESANDBOX${cobranca.txid.slice(0, 8)}`,
  });
}
