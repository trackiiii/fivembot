import type { Cobranca, Conta, Lancamento, Movimento } from "./banco.js";
import { comSql, sql, type QueryFn } from "./db.js";
import { novoComprovante } from "./brcode.js";
import type { PedidoMovimento } from "./store-kv.js";

type ContaRow = {
  chat_id: string;
  nome: string;
  termos_versao: string;
  aceitou_em: string;
  agencia: string;
  numero: string;
  chave_interna: string;
  referencia: string;
  saldo_centavos: string | number;
  cartao_final: string;
  cartao_bloqueado: boolean;
  status: string;
  versao: number;
};

function inteiro(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function contaDe(row: ContaRow, extrato: Movimento[] = []): Conta {
  return {
    chatId: row.chat_id,
    nome: row.nome,
    termosVersao: row.termos_versao,
    aceitouEm: typeof row.aceitou_em === "string" ? row.aceitou_em : new Date(row.aceitou_em).toISOString(),
    agencia: row.agencia,
    numero: row.numero,
    chaveInterna: row.chave_interna,
    referencia: row.referencia,
    saldoCentavos: inteiro(row.saldo_centavos),
    cartaoFinal: row.cartao_final,
    cartaoBloqueado: row.cartao_bloqueado,
    status: row.status === "bloqueada" || row.status === "desativada" ? "desativada" : "ativa",
    versao: row.versao,
    extrato,
  };
}

export async function upsertContaSql(conta: Conta): Promise<void> {
  await sql(
    `insert into contas (
      chat_id, nome, termos_versao, aceitou_em, agencia, numero, chave_interna, referencia,
      saldo_centavos, cartao_final, cartao_bloqueado, status, versao
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    on conflict (chat_id) do update set
      nome = excluded.nome,
      agencia = excluded.agencia,
      numero = excluded.numero,
      chave_interna = excluded.chave_interna,
      cartao_final = excluded.cartao_final,
      cartao_bloqueado = excluded.cartao_bloqueado,
      status = excluded.status,
      versao = excluded.versao,
      saldo_centavos = excluded.saldo_centavos,
      atualizado_em = now()`,
    [
      conta.chatId,
      conta.nome,
      conta.termosVersao,
      conta.aceitouEm,
      conta.agencia,
      conta.numero,
      conta.chaveInterna,
      conta.referencia,
      conta.saldoCentavos,
      conta.cartaoFinal,
      conta.cartaoBloqueado,
      conta.status,
      conta.versao,
    ],
  );
}

export async function chatIdPorNumeroSql(numero: string): Promise<string | undefined> {
  const rows = await sql<{ chat_id: string }>("select chat_id from contas where numero = $1 limit 1", [numero]);
  return rows[0]?.chat_id;
}

export async function chatIdPorChaveInternaSql(chave: string): Promise<string | undefined> {
  const rows = await sql<{ chat_id: string }>("select chat_id from contas where chave_interna = $1 limit 1", [chave]);
  return rows[0]?.chat_id;
}

export async function lerContaSql(chatId: string): Promise<Conta | undefined> {
  const rows = await sql<ContaRow>("select * from contas where chat_id = $1", [chatId]);
  const row = rows[0];
  if (row === undefined) return undefined;
  return contaDe(row, await extratoSql(chatId, 40));
}

export async function extratoSql(chatId: string, limite = 50): Promise<Movimento[]> {
  const rows = await sql<{
    id: string;
    tipo: string;
    valor_centavos: string | number;
    descricao: string;
    criado_em: string;
    comprovante: string | null;
  }>(
    "select id, tipo, valor_centavos, descricao, criado_em, comprovante from ledger where conta_chat_id = $1 order by criado_em asc, id asc limit $2",
    [chatId, limite],
  );
  return rows.map((row) => ({
    id: row.id,
    tipo: row.tipo as Movimento["tipo"],
    valorCentavos: inteiro(row.valor_centavos),
    descricao: row.descricao,
    em: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
    comprovante: row.comprovante ?? undefined,
  }));
}

export async function aplicarSql(pedido: {
  idempotencyKey: string;
  chatIds: string[];
  movimentos: PedidoMovimento[];
}): Promise<{ ok: true; comprovante: string } | { ok: false; motivo: "saldo_insuficiente" | "conta_bloqueada" | "repetido" | "sem_conta"; comprovante?: string }> {
  return comSql(async (query) => {
    const previa = await query<{ comprovante: string }>(
      "select comprovante from ledger where idempotency_key = $1 limit 1",
      [pedido.idempotencyKey],
    );
    if (previa[0]?.comprovante) return { ok: true as const, comprovante: previa[0].comprovante };
    const ids = [...new Set(pedido.chatIds)].sort();
    const contas = new Map<string, ContaRow>();
    for (const id of ids) {
      const rows = await query<ContaRow>("select * from contas where chat_id = $1 for update", [id]);
      if (rows[0] === undefined) return { ok: false as const, motivo: "sem_conta" as const };
      contas.set(id, rows[0]);
    }
    const saldos = new Map<string, number>();
    for (const [id, conta] of contas) saldos.set(id, inteiro(conta.saldo_centavos));
    for (const movimento of pedido.movimentos) {
      const conta = contas.get(movimento.chatId);
      if (conta === undefined) return { ok: false as const, motivo: "sem_conta" as const };
      if (
        (conta.status === "bloqueada" || conta.status === "desativada") &&
        movimento.valorCentavos < 0 &&
        movimento.tipo !== "taxa"
      ) {
        return { ok: false as const, motivo: "conta_bloqueada" as const };
      }
      const saldo = saldos.get(movimento.chatId) ?? 0;
      if (movimento.valorCentavos < 0 && saldo + movimento.valorCentavos < 0) {
        return { ok: false as const, motivo: "saldo_insuficiente" as const };
      }
      saldos.set(movimento.chatId, saldo + movimento.valorCentavos);
    }
    const comprovante = novoComprovante();
    for (const movimento of pedido.movimentos) {
      const conta = contas.get(movimento.chatId);
      if (conta === undefined) continue;
      const novoSaldo = inteiro(conta.saldo_centavos) + movimento.valorCentavos;
      const id = `${pedido.idempotencyKey}:${movimento.chatId}:${movimento.tipo}:${movimento.valorCentavos}`;
      await query(
        `insert into ledger (id, conta_chat_id, tipo, valor_centavos, descricao, comprovante, contra_chat_id, idempotency_key)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          movimento.chatId,
          movimento.tipo,
          movimento.valorCentavos,
          movimento.descricao.slice(0, 80),
          comprovante,
          movimento.contraChatId ?? null,
          pedido.idempotencyKey,
        ],
      );
      await query("update contas set saldo_centavos = $2, versao = versao + 1, atualizado_em = now() where chat_id = $1", [
        movimento.chatId,
        novoSaldo,
      ]);
      conta.saldo_centavos = novoSaldo;
    }
    return { ok: true as const, comprovante };
  });
}

export async function listarContasSql(limite = 50): Promise<Conta[]> {
  const rows = await sql<ContaRow>("select * from contas order by aceitou_em desc limit $1", [limite]);
  return rows.map((row) => contaDe(row));
}

export async function listarChatIdsSql(): Promise<string[]> {
  const rows = await sql<{ chat_id: string }>("select chat_id from contas order by aceitou_em desc");
  return rows.map((row) => row.chat_id);
}

export async function listarLedgerSql(limite = 40): Promise<Lancamento[]> {
  const rows = await sql<{
    id: string;
    conta_chat_id: string;
    tipo: string;
    valor_centavos: string | number;
    descricao: string;
    criado_em: string;
    comprovante: string | null;
    contra_chat_id: string | null;
    idempotency_key: string;
  }>("select * from ledger order by criado_em desc limit $1", [limite]);
  return rows.map((row) => ({
    id: row.id,
    chatId: row.conta_chat_id,
    tipo: row.tipo as Movimento["tipo"],
    valorCentavos: inteiro(row.valor_centavos),
    descricao: row.descricao,
    em: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
    comprovante: row.comprovante ?? undefined,
    contraChatId: row.contra_chat_id ?? undefined,
    idempotencyKey: row.idempotency_key,
  }));
}

export async function gravarCobrancaSql(cobranca: Cobranca): Promise<void> {
  await sql(
    `insert into cobrancas (id, chat_id, valor_centavos, taxa_centavos, txid, copia_e_cola, status, provedor, webhook_id, end_to_end_id, comprovante, criada_em, paga_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (id) do update set
       status = excluded.status,
       taxa_centavos = excluded.taxa_centavos,
       webhook_id = excluded.webhook_id,
       end_to_end_id = excluded.end_to_end_id,
       comprovante = excluded.comprovante,
       paga_em = excluded.paga_em`,
    [
      cobranca.id,
      cobranca.chatId,
      cobranca.valorCentavos,
      cobranca.taxaCentavos ?? 0,
      cobranca.txid,
      cobranca.copiaECola,
      cobranca.status,
      cobranca.provedor,
      cobranca.webhookId ?? null,
      cobranca.endToEndId ?? null,
      cobranca.comprovante ?? null,
      cobranca.criadaEm,
      cobranca.pagaEm ?? null,
    ],
  );
}

export async function lerCobrancaSql(id: string): Promise<Cobranca | undefined> {
  const rows = await sql<Record<string, unknown>>("select * from cobrancas where id = $1", [id]);
  return cobrancaDe(rows[0]);
}

export async function lerCobrancaTxidSql(txid: string): Promise<Cobranca | undefined> {
  const rows = await sql<Record<string, unknown>>("select * from cobrancas where txid = $1", [txid]);
  return cobrancaDe(rows[0]);
}

export async function listarCobrancasSql(chatId?: string, limite = 30): Promise<Cobranca[]> {
  const rows =
    chatId === undefined
      ? await sql<Record<string, unknown>>("select * from cobrancas order by criada_em desc limit $1", [limite])
      : await sql<Record<string, unknown>>("select * from cobrancas where chat_id = $1 order by criada_em desc limit $2", [
          chatId,
          limite,
        ]);
  return rows.map((row) => cobrancaDe(row)).filter((item): item is Cobranca => item !== undefined);
}

function cobrancaDe(row: Record<string, unknown> | undefined): Cobranca | undefined {
  if (row === undefined) return undefined;
  if (
    typeof row.id !== "string" ||
    typeof row.chat_id !== "string" ||
    typeof row.txid !== "string" ||
    typeof row.copia_e_cola !== "string" ||
    typeof row.status !== "string" ||
    typeof row.provedor !== "string"
  ) {
    return undefined;
  }
  if (row.status !== "aberta" && row.status !== "paga" && row.status !== "expirada" && row.status !== "cancelada") {
    return undefined;
  }
  return {
    id: row.id,
    chatId: row.chat_id,
    valorCentavos: inteiro(row.valor_centavos as string | number),
    taxaCentavos: inteiro((row.taxa_centavos as string | number | undefined) ?? 0),
    txid: row.txid,
    copiaECola: row.copia_e_cola,
    status: row.status,
    provedor: row.provedor,
    webhookId: typeof row.webhook_id === "string" ? row.webhook_id : undefined,
    endToEndId: typeof row.end_to_end_id === "string" ? row.end_to_end_id : undefined,
    comprovante: typeof row.comprovante === "string" ? row.comprovante : undefined,
    criadaEm: String(row.criada_em),
    pagaEm: row.paga_em === null || row.paga_em === undefined ? undefined : String(row.paga_em),
  };
}

export async function marcarWebhookSql(id: string, tipo: string, hash: string): Promise<boolean> {
  const rows = await sql<{ id: string }>(
    "insert into webhooks (id, tipo, payload_hash) values ($1,$2,$3) on conflict (id) do nothing returning id",
    [id, tipo, hash],
  );
  return rows.length > 0;
}

export async function auditoriaSql(id: string, acao: string, detalhe: string): Promise<void> {
  await sql("insert into admin_audit (id, acao, detalhe) values ($1,$2,$3)", [id, acao, detalhe]);
}

export type { QueryFn };
