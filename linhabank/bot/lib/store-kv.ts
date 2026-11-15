import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { novoComprovante } from "./brcode.js";
import { comTravas } from "./trava.js";
import type { Cobranca, Conta, Lancamento, Movimento } from "./banco.js";

const INDICE_CONTAS = "linhabank:contas:indice";
const INDICE_LEDGER = "linhabank:ledger:indice";

function comoObjeto(valor: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

function lista(valor: JsonValue | undefined): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}

function chaveLedger(id: string): string {
  return `linhabank:ledger:id:${id}`;
}

function chaveLedgerConta(chatId: string): string {
  return `linhabank:ledger:conta:${chatId}`;
}

function chaveCobranca(id: string): string {
  return `linhabank:cobranca:${id}`;
}

function chaveCobrancaTxid(txid: string): string {
  return `linhabank:cobranca:txid:${txid}`;
}

function chaveIdem(chave: string): string {
  return `linhabank:ledger:idem:${chave}`;
}

export async function registrarIndiceConta(kv: HostKvApi, chatId: string): Promise<void> {
  const atual = lista(await kv.get(INDICE_CONTAS));
  if (atual.includes(chatId)) return;
  atual.push(chatId);
  await kv.put(INDICE_CONTAS, atual.slice(-50_000));
}

export async function listarChatIds(kv: HostKvApi): Promise<string[]> {
  return lista(await kv.get(INDICE_CONTAS));
}

export async function lerLancamento(kv: HostKvApi, id: string): Promise<Lancamento | undefined> {
  const item = comoObjeto(await kv.get(chaveLedger(id)));
  if (item === undefined) return undefined;
  if (
    typeof item.id !== "string" ||
    typeof item.chatId !== "string" ||
    typeof item.tipo !== "string" ||
    typeof item.valorCentavos !== "number" ||
    typeof item.descricao !== "string" ||
    typeof item.em !== "string" ||
    typeof item.idempotencyKey !== "string"
  ) {
    return undefined;
  }
  return {
    id: item.id,
    chatId: item.chatId,
    tipo: item.tipo as Movimento["tipo"],
    valorCentavos: item.valorCentavos,
    descricao: item.descricao,
    em: item.em,
    comprovante: typeof item.comprovante === "string" ? item.comprovante : undefined,
    contraChatId: typeof item.contraChatId === "string" ? item.contraChatId : undefined,
    idempotencyKey: item.idempotencyKey,
  };
}

export async function extratoLedger(kv: HostKvApi, chatId: string, limite = 50): Promise<Movimento[]> {
  const ids = lista(await kv.get(chaveLedgerConta(chatId)));
  const saida: Movimento[] = [];
  for (const id of ids.slice(-limite)) {
    const item = await lerLancamento(kv, id);
    if (item === undefined) continue;
    saida.push({
      id: item.id,
      tipo: item.tipo,
      valorCentavos: item.valorCentavos,
      descricao: item.descricao,
      em: item.em,
      comprovante: item.comprovante,
    });
  }
  return saida;
}

export async function listarLedger(kv: HostKvApi, limite = 40): Promise<Lancamento[]> {
  const ids = lista(await kv.get(INDICE_LEDGER));
  const saida: Lancamento[] = [];
  for (const id of ids.slice(-limite).reverse()) {
    const item = await lerLancamento(kv, id);
    if (item !== undefined) saida.push(item);
  }
  return saida;
}

export async function gravarLancamentos(
  kv: HostKvApi,
  lancamentos: Lancamento[],
): Promise<void> {
  const indice = lista(await kv.get(INDICE_LEDGER));
  for (const item of lancamentos) {
    await kv.put(chaveLedger(item.id), item);
    const daConta = lista(await kv.get(chaveLedgerConta(item.chatId)));
    daConta.push(item.id);
    await kv.put(chaveLedgerConta(item.chatId), daConta);
    indice.push(item.id);
  }
  await kv.put(INDICE_LEDGER, indice.slice(-20_000));
}

export type PedidoMovimento = {
  chatId: string;
  tipo: Movimento["tipo"];
  valorCentavos: number;
  descricao: string;
  contraChatId?: string;
};

export async function aplicarAtomico(
  kv: HostKvApi,
  pedido: {
    idempotencyKey: string;
    chatIds: string[];
    movimentos: PedidoMovimento[];
    carregar: (chatId: string) => Promise<Conta | undefined>;
    gravarConta: (conta: Conta) => Promise<void>;
  },
): Promise<{ ok: true; contas: Conta[]; comprovante: string } | { ok: false; motivo: "saldo_insuficiente" | "conta_bloqueada" | "sem_conta"; contas: Conta[]; comprovante?: string }> {
  const ids = [...new Set(pedido.chatIds)];
  return comTravas(kv, ids, async () => {
    const previa = comoObjeto(await kv.get(chaveIdem(pedido.idempotencyKey)));
    if (previa?.ok === true && typeof previa.comprovante === "string") {
      const contas: Conta[] = [];
      for (const id of ids) {
        const conta = await pedido.carregar(id);
        if (conta !== undefined) contas.push(conta);
      }
      return { ok: true as const, contas, comprovante: previa.comprovante };
    }
    const mapa = new Map<string, Conta>();
    for (const id of ids) {
      const conta = await pedido.carregar(id);
      if (conta === undefined) return { ok: false as const, motivo: "sem_conta" as const, contas: [] };
      mapa.set(id, { ...conta, extrato: [...conta.extrato] });
    }
    const saldos = new Map<string, number>();
    for (const [id, conta] of mapa) saldos.set(id, conta.saldoCentavos);
    for (const movimento of pedido.movimentos) {
      const conta = mapa.get(movimento.chatId);
      if (conta === undefined) return { ok: false as const, motivo: "sem_conta" as const, contas: [] };
      if (conta.status === "bloqueada" && movimento.valorCentavos < 0 && movimento.tipo !== "taxa") {
        return { ok: false as const, motivo: "conta_bloqueada" as const, contas: [...mapa.values()] };
      }
      const saldo = saldos.get(movimento.chatId) ?? 0;
      if (movimento.valorCentavos < 0 && saldo + movimento.valorCentavos < 0) {
        return { ok: false as const, motivo: "saldo_insuficiente" as const, contas: [...mapa.values()] };
      }
      saldos.set(movimento.chatId, saldo + movimento.valorCentavos);
    }
    const comprovante = novoComprovante();
    const agora = new Date().toISOString();
    const lancamentos: Lancamento[] = [];
    for (const movimento of pedido.movimentos) {
      const conta = mapa.get(movimento.chatId);
      if (conta === undefined) continue;
      conta.saldoCentavos += movimento.valorCentavos;
      conta.versao += 1;
      const id = `${pedido.idempotencyKey}:${movimento.chatId}:${movimento.tipo}:${movimento.valorCentavos}`;
      const lancamento: Lancamento = {
        id,
        chatId: movimento.chatId,
        tipo: movimento.tipo,
        valorCentavos: movimento.valorCentavos,
        descricao: movimento.descricao.slice(0, 80),
        em: agora,
        comprovante,
        contraChatId: movimento.contraChatId,
        idempotencyKey: pedido.idempotencyKey,
      };
      lancamentos.push(lancamento);
      conta.extrato.push({
        id,
        tipo: movimento.tipo,
        valorCentavos: movimento.valorCentavos,
        descricao: lancamento.descricao,
        em: agora,
        comprovante,
      });
      if (conta.extrato.length > 40) conta.extrato.splice(0, conta.extrato.length - 40);
    }
    await gravarLancamentos(kv, lancamentos);
    for (const conta of mapa.values()) await pedido.gravarConta(conta);
    await kv.put(chaveIdem(pedido.idempotencyKey), { ok: true, comprovante });
    return { ok: true as const, contas: [...mapa.values()], comprovante };
  });
}

export async function gravarCobranca(kv: HostKvApi, cobranca: Cobranca): Promise<void> {
  await kv.put(chaveCobranca(cobranca.id), cobranca);
  await kv.put(chaveCobrancaTxid(cobranca.txid), cobranca.id);
  const listaChat = lista(await kv.get(`linhabank:cobranca:chat:${cobranca.chatId}`));
  listaChat.push(cobranca.id);
  await kv.put(`linhabank:cobranca:chat:${cobranca.chatId}`, listaChat.slice(-100));
}

export async function lerCobranca(kv: HostKvApi, id: string): Promise<Cobranca | undefined> {
  return lerCobrancaRegistro(comoObjeto(await kv.get(chaveCobranca(id))));
}

export async function lerCobrancaPorTxid(kv: HostKvApi, txid: string): Promise<Cobranca | undefined> {
  const id = await kv.get(chaveCobrancaTxid(txid));
  if (typeof id !== "string") return undefined;
  return lerCobranca(kv, id);
}

function lerCobrancaRegistro(item: Record<string, JsonValue> | undefined): Cobranca | undefined {
  if (item === undefined) return undefined;
  if (
    typeof item.id !== "string" ||
    typeof item.chatId !== "string" ||
    typeof item.valorCentavos !== "number" ||
    typeof item.txid !== "string" ||
    typeof item.copiaECola !== "string" ||
    typeof item.status !== "string" ||
    typeof item.provedor !== "string" ||
    typeof item.criadaEm !== "string"
  ) {
    return undefined;
  }
  if (item.status !== "aberta" && item.status !== "paga" && item.status !== "expirada" && item.status !== "cancelada") {
    return undefined;
  }
  return {
    id: item.id,
    chatId: item.chatId,
    valorCentavos: item.valorCentavos,
    txid: item.txid,
    copiaECola: item.copiaECola,
    status: item.status,
    provedor: item.provedor,
    webhookId: typeof item.webhookId === "string" ? item.webhookId : undefined,
    endToEndId: typeof item.endToEndId === "string" ? item.endToEndId : undefined,
    comprovante: typeof item.comprovante === "string" ? item.comprovante : undefined,
    criadaEm: item.criadaEm,
    pagaEm: typeof item.pagaEm === "string" ? item.pagaEm : undefined,
  };
}

export async function listarCobrancas(kv: HostKvApi, chatId?: string, limite = 30): Promise<Cobranca[]> {
  if (chatId !== undefined) {
    const ids = lista(await kv.get(`linhabank:cobranca:chat:${chatId}`));
    const saida: Cobranca[] = [];
    for (const id of ids.slice(-limite).reverse()) {
      const item = await lerCobranca(kv, id);
      if (item !== undefined) saida.push(item);
    }
    return saida;
  }
  const chats = await listarChatIds(kv);
  const saida: Cobranca[] = [];
  for (const id of chats.slice(-200)) {
    const itens = await listarCobrancas(kv, id, 5);
    saida.push(...itens);
  }
  return saida.sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)).slice(0, limite);
}
