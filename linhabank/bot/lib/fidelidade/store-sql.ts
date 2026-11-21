import { comSql, sql } from "../db.js";
import type {
  AuditoriaAdmin,
  CarteiraLbcoins,
  HistoricoXp,
  Indicacao,
  MovimentoLbcoins,
  RecompensaIndicacao,
  TipoLbcoins,
  XpUsuario,
} from "./tipos.js";
import { novoId } from "./ids.js";

type WalletRow = {
  chat_id: string;
  saldo: string | number;
  total_recebido: string | number;
  total_utilizado: string | number;
  recompensas_bloqueadas: boolean;
  codigo_indicacao: string;
  criado_em: string;
  versao: number;
};

type TxRow = {
  id: string;
  chat_id: string;
  tipo: string;
  quantidade: string | number;
  descricao: string;
  origem: string;
  status: string;
  idempotency_key: string;
  criado_em: string;
};

type RefRow = {
  id: string;
  indicador_chat_id: string;
  indicado_chat_id: string;
  codigo: string;
  status: string;
  motivo: string | null;
  criado_em: string;
  decidido_em: string | null;
  decidido_por: string | null;
};

type XpRow = {
  chat_id: string;
  xp: string | number;
  categoria: string;
  categoria_em: string;
  versao: number;
};

function n(valor: string | number): number {
  return typeof valor === "number" ? valor : Number(valor);
}

function carteiraDe(row: WalletRow): CarteiraLbcoins {
  return {
    chatId: row.chat_id,
    saldo: n(row.saldo),
    totalRecebido: n(row.total_recebido),
    totalUtilizado: n(row.total_utilizado),
    recompensasBloqueadas: row.recompensas_bloqueadas === true,
    codigoIndicacao: row.codigo_indicacao,
    criadoEm: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
    versao: row.versao,
  };
}

function txDe(row: TxRow): MovimentoLbcoins {
  return {
    id: row.id,
    chatId: row.chat_id,
    tipo: row.tipo as TipoLbcoins,
    quantidade: n(row.quantidade),
    descricao: row.descricao,
    origem: row.origem,
    status: row.status === "bloqueado" ? "bloqueado" : "confirmado",
    idempotencyKey: row.idempotency_key,
    em: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
  };
}

function refDe(row: RefRow): Indicacao {
  return {
    id: row.id,
    indicadorChatId: row.indicador_chat_id,
    indicadoChatId: row.indicado_chat_id,
    codigo: row.codigo,
    status: row.status === "aprovada" || row.status === "rejeitada" ? row.status : "pendente",
    motivo: row.motivo ?? undefined,
    criadoEm: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
    decididoEm: row.decidido_em === null || row.decidido_em === undefined
      ? undefined
      : typeof row.decidido_em === "string"
        ? row.decidido_em
        : new Date(row.decidido_em).toISOString(),
    decididoPor: row.decidido_por ?? undefined,
  };
}

function xpDe(row: XpRow): XpUsuario {
  return {
    chatId: row.chat_id,
    xp: n(row.xp),
    categoria: row.categoria === "prata" || row.categoria === "ouro" ? row.categoria : "bronze",
    categoriaEm: typeof row.categoria_em === "string" ? row.categoria_em : new Date(row.categoria_em).toISOString(),
    versao: row.versao,
  };
}

export async function lerCarteiraSql(chatId: string): Promise<CarteiraLbcoins | undefined> {
  const rows = await sql<WalletRow>("select * from loyalty_wallets where chat_id = $1", [chatId]);
  return rows[0] === undefined ? undefined : carteiraDe(rows[0]);
}

export async function chatIdDoCodigoSql(codigo: string): Promise<string | undefined> {
  const rows = await sql<{ chat_id: string }>("select chat_id from loyalty_wallets where codigo_indicacao = $1", [codigo]);
  return rows[0]?.chat_id;
}

export async function upsertCarteiraSql(carteira: CarteiraLbcoins): Promise<void> {
  await sql(
    `insert into loyalty_wallets (
      chat_id, saldo, total_recebido, total_utilizado, recompensas_bloqueadas, codigo_indicacao, criado_em, versao
    ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (chat_id) do update set
      saldo = excluded.saldo,
      total_recebido = excluded.total_recebido,
      total_utilizado = excluded.total_utilizado,
      recompensas_bloqueadas = excluded.recompensas_bloqueadas,
      codigo_indicacao = excluded.codigo_indicacao,
      versao = excluded.versao`,
    [
      carteira.chatId,
      carteira.saldo,
      carteira.totalRecebido,
      carteira.totalUtilizado,
      carteira.recompensasBloqueadas,
      carteira.codigoIndicacao,
      carteira.criadoEm,
      carteira.versao,
    ],
  );
}

export async function aplicarLbcoinsSql(pedido: {
  chatId: string;
  tipo: TipoLbcoins;
  quantidade: number;
  descricao: string;
  origem: string;
  idempotencyKey: string;
  admin?: boolean;
}): Promise<
  | { ok: true; carteira: CarteiraLbcoins; movimento: MovimentoLbcoins; repetido: boolean }
  | { ok: false; motivo: "saldo_insuficiente" | "bloqueado" | "quantidade_invalida" }
> {
  if (!Number.isSafeInteger(pedido.quantidade) || pedido.quantidade === 0) {
    return { ok: false, motivo: "quantidade_invalida" };
  }
  return comSql(async (query) => {
    const previa = await query<TxRow>("select * from loyalty_transactions where idempotency_key = $1 limit 1", [
      pedido.idempotencyKey,
    ]);
    if (previa[0] !== undefined) {
      const carteiraRows = await query<WalletRow>("select * from loyalty_wallets where chat_id = $1", [pedido.chatId]);
      if (carteiraRows[0] === undefined) return { ok: false as const, motivo: "bloqueado" as const };
      return { ok: true as const, carteira: carteiraDe(carteiraRows[0]), movimento: txDe(previa[0]), repetido: true };
    }
    const locked = await query<WalletRow>("select * from loyalty_wallets where chat_id = $1 for update", [pedido.chatId]);
    if (locked[0] === undefined) return { ok: false as const, motivo: "bloqueado" as const };
    const carteira = carteiraDe(locked[0]);
    if (carteira.recompensasBloqueadas && pedido.quantidade > 0 && pedido.admin !== true) {
      return { ok: false as const, motivo: "bloqueado" as const };
    }
    const novoSaldo = carteira.saldo + pedido.quantidade;
    if (novoSaldo < 0) return { ok: false as const, motivo: "saldo_insuficiente" as const };
    const id = novoId("lbtx");
    const agora = new Date().toISOString();
    await query(
      `insert into loyalty_transactions (id, chat_id, tipo, quantidade, descricao, origem, status, idempotency_key, criado_em)
       values ($1,$2,$3,$4,$5,$6,'confirmado',$7,$8)`,
      [id, pedido.chatId, pedido.tipo, pedido.quantidade, pedido.descricao.slice(0, 240), pedido.origem.slice(0, 80), pedido.idempotencyKey, agora],
    );
    const totalRecebido = carteira.totalRecebido + (pedido.quantidade > 0 ? pedido.quantidade : 0);
    const totalUtilizado = carteira.totalUtilizado + (pedido.quantidade < 0 ? -pedido.quantidade : 0);
    await query(
      `update loyalty_wallets set saldo = $2, total_recebido = $3, total_utilizado = $4, versao = versao + 1 where chat_id = $1`,
      [pedido.chatId, novoSaldo, totalRecebido, totalUtilizado],
    );
    const atualizada: CarteiraLbcoins = {
      ...carteira,
      saldo: novoSaldo,
      totalRecebido,
      totalUtilizado,
      versao: carteira.versao + 1,
    };
    const movimento: MovimentoLbcoins = {
      id,
      chatId: pedido.chatId,
      tipo: pedido.tipo,
      quantidade: pedido.quantidade,
      descricao: pedido.descricao.slice(0, 240),
      origem: pedido.origem.slice(0, 80),
      status: "confirmado",
      idempotencyKey: pedido.idempotencyKey,
      em: agora,
    };
    return { ok: true as const, carteira: atualizada, movimento, repetido: false };
  });
}

export async function historicoLbcoinsSql(chatId: string, limite = 30): Promise<MovimentoLbcoins[]> {
  const rows = await sql<TxRow>(
    "select * from loyalty_transactions where chat_id = $1 order by criado_em desc limit $2",
    [chatId, limite],
  );
  return rows.map(txDe);
}

export async function upsertXpSql(xp: XpUsuario): Promise<void> {
  await sql(
    `insert into user_xp (chat_id, xp, categoria, categoria_em, versao) values ($1,$2,$3,$4,$5)
     on conflict (chat_id) do update set xp = excluded.xp, categoria = excluded.categoria, categoria_em = excluded.categoria_em, versao = excluded.versao`,
    [xp.chatId, xp.xp, xp.categoria, xp.categoriaEm, xp.versao],
  );
}

export async function lerXpSql(chatId: string): Promise<XpUsuario | undefined> {
  const rows = await sql<XpRow>("select * from user_xp where chat_id = $1", [chatId]);
  return rows[0] === undefined ? undefined : xpDe(rows[0]);
}

export async function gravarHistoricoXpSql(item: HistoricoXp): Promise<void> {
  await sql(
    `insert into user_xp_historico (id, chat_id, xp_anterior, xp_novo, categoria_anterior, categoria_nova, motivo, criado_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
    [item.id, item.chatId, item.xpAnterior, item.xpNovo, item.categoriaAnterior, item.categoriaNova, item.motivo, item.em],
  );
}

export async function historicoXpSql(chatId: string, limite = 12): Promise<HistoricoXp[]> {
  const rows = await sql<{
    id: string;
    chat_id: string;
    xp_anterior: string | number;
    xp_novo: string | number;
    categoria_anterior: string;
    categoria_nova: string;
    motivo: string;
    criado_em: string;
  }>("select * from user_xp_historico where chat_id = $1 order by criado_em desc limit $2", [chatId, limite]);
  return rows.map((row) => ({
    id: row.id,
    chatId: row.chat_id,
    xpAnterior: n(row.xp_anterior),
    xpNovo: n(row.xp_novo),
    categoriaAnterior: row.categoria_anterior === "prata" || row.categoria_anterior === "ouro" ? row.categoria_anterior : "bronze",
    categoriaNova: row.categoria_nova === "prata" || row.categoria_nova === "ouro" ? row.categoria_nova : "bronze",
    motivo: row.motivo,
    em: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
  }));
}

export async function upsertIndicacaoSql(item: Indicacao): Promise<void> {
  await sql(
    `insert into user_referrals (
      id, indicador_chat_id, indicado_chat_id, codigo, status, motivo, criado_em, decidido_em, decidido_por
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    on conflict (id) do update set
      status = excluded.status,
      motivo = excluded.motivo,
      decidido_em = excluded.decidido_em,
      decidido_por = excluded.decidido_por`,
    [
      item.id,
      item.indicadorChatId,
      item.indicadoChatId,
      item.codigo,
      item.status,
      item.motivo ?? null,
      item.criadoEm,
      item.decididoEm ?? null,
      item.decididoPor ?? null,
    ],
  );
}

export async function lerIndicacaoSql(id: string): Promise<Indicacao | undefined> {
  const rows = await sql<RefRow>("select * from user_referrals where id = $1", [id]);
  return rows[0] === undefined ? undefined : refDe(rows[0]);
}

export async function indicacaoDoIndicadoSql(chatId: string): Promise<Indicacao | undefined> {
  const rows = await sql<RefRow>("select * from user_referrals where indicado_chat_id = $1", [chatId]);
  return rows[0] === undefined ? undefined : refDe(rows[0]);
}

export async function indicacoesDeSql(chatId: string): Promise<Indicacao[]> {
  const rows = await sql<RefRow>(
    "select * from user_referrals where indicador_chat_id = $1 order by criado_em desc",
    [chatId],
  );
  return rows.map(refDe);
}

export async function indicacoesPendentesSql(limite = 40): Promise<Indicacao[]> {
  const rows = await sql<RefRow>(
    "select * from user_referrals where status = 'pendente' order by criado_em asc limit $1",
    [limite],
  );
  return rows.map(refDe);
}

export async function upsertRewardSql(item: RecompensaIndicacao): Promise<void> {
  await sql(
    `insert into referral_rewards (id, referral_id, chat_id, quantidade, transacao_id, criado_em)
     values ($1,$2,$3,$4,$5,$6) on conflict (referral_id) do nothing`,
    [item.id, item.referralId, item.chatId, item.quantidade, item.transacaoId, item.em],
  );
}

export async function lerRewardSql(referralId: string): Promise<RecompensaIndicacao | undefined> {
  const rows = await sql<{
    id: string;
    referral_id: string;
    chat_id: string;
    quantidade: string | number;
    transacao_id: string;
    criado_em: string;
  }>("select * from referral_rewards where referral_id = $1", [referralId]);
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    id: row.id,
    referralId: row.referral_id,
    chatId: row.chat_id,
    quantidade: n(row.quantidade),
    transacaoId: row.transacao_id,
    em: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
  };
}

export async function gravarAuditoriaSql(item: AuditoriaAdmin): Promise<void> {
  await sql(
    `insert into admin_audit_logs (id, operador_chat_id, acao, alvo_chat_id, motivo, valor_anterior, valor_novo, criado_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (id) do nothing`,
    [
      item.id,
      item.operadorChatId,
      item.acao,
      item.alvoChatId ?? null,
      item.motivo,
      item.valorAnterior ?? null,
      item.valorNovo ?? null,
      item.em,
    ],
  );
}

export async function listarAuditoriaSql(limite = 20): Promise<AuditoriaAdmin[]> {
  const rows = await sql<{
    id: string;
    operador_chat_id: string;
    acao: string;
    alvo_chat_id: string | null;
    motivo: string;
    valor_anterior: string | null;
    valor_novo: string | null;
    criado_em: string;
  }>("select * from admin_audit_logs order by criado_em desc limit $1", [limite]);
  return rows.map((row) => ({
    id: row.id,
    operadorChatId: row.operador_chat_id,
    acao: row.acao,
    alvoChatId: row.alvo_chat_id ?? undefined,
    motivo: row.motivo,
    valorAnterior: row.valor_anterior ?? undefined,
    valorNovo: row.valor_novo ?? undefined,
    em: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
  }));
}
