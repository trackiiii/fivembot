import { randomBytes } from "node:crypto";

import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { comSql, sql, sqlDisponivel } from "../db.js";
import { comTravas } from "../trava.js";
import { LIMITE_COFRINHOS, type Cofrinho, type PoteTravado } from "./tipos.js";

const INDICE = "linhabank:cofrinho:indice";

function chave(id: string): string {
  return `linhabank:cofrinho:${id}`;
}

function indiceConta(chatId: string): string {
  return `linhabank:cofrinho:conta:${chatId}`;
}

function inteiro(valor: unknown): number {
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return valor;
  if (typeof valor === "string" && /^-?\d+$/.test(valor)) return Number(valor);
  return 0;
}

function comoObjeto(valor: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

function lista(valor: JsonValue | undefined): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}

function lerRegistro(item: Record<string, JsonValue> | undefined): Cofrinho | undefined {
  if (item === undefined) return undefined;
  if (typeof item.id !== "string" || typeof item.chatId !== "string" || typeof item.nome !== "string") return undefined;
  if (typeof item.criadoEm !== "string") return undefined;
  const status = item.status === "encerrado" ? "encerrado" : "ativo";
  return {
    id: item.id,
    chatId: item.chatId,
    nome: item.nome,
    metaCentavos: Math.max(0, inteiro(item.metaCentavos)),
    saldoCentavos: Math.max(0, inteiro(item.saldoCentavos)),
    status,
    criadoEm: item.criadoEm,
  };
}

export function novoIdCofrinho(): string {
  return `cf${randomBytes(4).toString("hex")}`;
}

export async function lerCofrinho(kv: HostKvApi, id: string): Promise<Cofrinho | undefined> {
  if (sqlDisponivel()) return lerSql(id);
  return lerRegistro(comoObjeto(await kv.get(chave(id))));
}

export async function carregarPote(kv: HostKvApi, id: string): Promise<PoteTravado | undefined> {
  const pote = await lerCofrinho(kv, id);
  if (pote === undefined) return undefined;
  return { chatId: pote.chatId, saldoCentavos: pote.saldoCentavos, status: pote.status };
}

export async function gravarSaldoPote(kv: HostKvApi, id: string, saldoCentavos: number): Promise<void> {
  if (sqlDisponivel()) return;
  const atual = lerRegistro(comoObjeto(await kv.get(chave(id))));
  if (atual === undefined) return;
  atual.saldoCentavos = saldoCentavos;
  await kv.put(chave(id), atual);
}

export async function listarCofrinhos(kv: HostKvApi, chatId: string, incluirEncerrados = false): Promise<Cofrinho[]> {
  const itens = sqlDisponivel() ? await listarSql(chatId) : await listarKv(kv, chatId);
  const filtrados = incluirEncerrados ? itens : itens.filter((item) => item.status === "ativo");
  return filtrados.sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.nome.localeCompare(b.nome));
}

export async function totalGuardadoConta(kv: HostKvApi, chatId: string): Promise<number> {
  const itens = await listarCofrinhos(kv, chatId);
  return itens.reduce((soma, item) => soma + item.saldoCentavos, 0);
}

export async function totalGuardadoGeral(kv: HostKvApi): Promise<number> {
  if (sqlDisponivel()) {
    const rows = await sql<{ total: string | number }>(
      "select coalesce(sum(saldo_centavos), 0) as total from cofrinhos where status = 'ativo'",
    );
    return inteiro(rows[0]?.total);
  }
  const ids = lista(await kv.get(INDICE));
  let total = 0;
  for (const id of ids) {
    const pote = lerRegistro(comoObjeto(await kv.get(chave(id))));
    if (pote?.status === "ativo") total += pote.saldoCentavos;
  }
  return total;
}

export async function criarCofrinho(
  kv: HostKvApi,
  chatId: string,
  nome: string,
  metaCentavos: number,
): Promise<{ ok: true; cofrinho: Cofrinho } | { ok: false; motivo: "limite" | "nome_em_uso" | "sem_conta" }> {
  if (sqlDisponivel()) return criarSql(chatId, nome, metaCentavos);
  return comTravas(kv, [chatId], async () => {
    const ativos = (await listarKv(kv, chatId)).filter((item) => item.status === "ativo");
    if (ativos.length >= LIMITE_COFRINHOS) return { ok: false as const, motivo: "limite" as const };
    if (ativos.some((item) => item.nome.toLowerCase() === nome.toLowerCase())) {
      return { ok: false as const, motivo: "nome_em_uso" as const };
    }
    const pote: Cofrinho = {
      id: novoIdCofrinho(),
      chatId,
      nome,
      metaCentavos,
      saldoCentavos: 0,
      status: "ativo",
      criadoEm: new Date().toISOString(),
    };
    await gravarNovoKv(kv, pote);
    return { ok: true as const, cofrinho: pote };
  });
}

export async function atualizarCofrinho(
  kv: HostKvApi,
  chatId: string,
  id: string,
  patch: { nome?: string; metaCentavos?: number },
): Promise<{ ok: true; cofrinho: Cofrinho } | { ok: false; motivo: "nao_acha" | "nome_em_uso" | "encerrado" }> {
  if (sqlDisponivel()) return atualizarSql(chatId, id, patch);
  return comTravas(kv, [chatId], async () => {
    const atual = lerRegistro(comoObjeto(await kv.get(chave(id))));
    if (atual === undefined || atual.chatId !== chatId) return { ok: false as const, motivo: "nao_acha" as const };
    if (atual.status !== "ativo") return { ok: false as const, motivo: "encerrado" as const };
    if (patch.nome !== undefined && patch.nome.toLowerCase() !== atual.nome.toLowerCase()) {
      const ativos = (await listarKv(kv, chatId)).filter((item) => item.status === "ativo");
      if (ativos.some((item) => item.id !== id && item.nome.toLowerCase() === patch.nome?.toLowerCase())) {
        return { ok: false as const, motivo: "nome_em_uso" as const };
      }
      atual.nome = patch.nome;
    }
    if (patch.metaCentavos !== undefined) atual.metaCentavos = patch.metaCentavos;
    await kv.put(chave(id), atual);
    return { ok: true as const, cofrinho: atual };
  });
}

export async function encerrarCofrinho(
  kv: HostKvApi,
  chatId: string,
  id: string,
): Promise<{ ok: true; cofrinho: Cofrinho } | { ok: false; motivo: "nao_acha" | "com_saldo" | "encerrado" }> {
  if (sqlDisponivel()) return encerrarSql(chatId, id);
  return comTravas(kv, [chatId], async () => {
    const atual = lerRegistro(comoObjeto(await kv.get(chave(id))));
    if (atual === undefined || atual.chatId !== chatId) return { ok: false as const, motivo: "nao_acha" as const };
    if (atual.status !== "ativo") return { ok: false as const, motivo: "encerrado" as const };
    if (atual.saldoCentavos > 0) return { ok: false as const, motivo: "com_saldo" as const };
    atual.status = "encerrado";
    await kv.put(chave(id), atual);
    return { ok: true as const, cofrinho: atual };
  });
}

async function listarKv(kv: HostKvApi, chatId: string): Promise<Cofrinho[]> {
  const ids = lista(await kv.get(indiceConta(chatId)));
  const saida: Cofrinho[] = [];
  for (const id of ids) {
    const pote = lerRegistro(comoObjeto(await kv.get(chave(id))));
    if (pote !== undefined && pote.chatId === chatId) saida.push(pote);
  }
  return saida;
}

async function gravarNovoKv(kv: HostKvApi, pote: Cofrinho): Promise<void> {
  await kv.put(chave(pote.id), pote);
  const daConta = lista(await kv.get(indiceConta(pote.chatId)));
  daConta.push(pote.id);
  await kv.put(indiceConta(pote.chatId), daConta.slice(-40));
  const geral = lista(await kv.get(INDICE));
  geral.push(pote.id);
  await kv.put(INDICE, geral.slice(-20_000));
}

type Linha = {
  id: string;
  chat_id: string;
  nome: string;
  meta_centavos: string | number;
  saldo_centavos: string | number;
  status: string;
  criado_em: string;
};

function deLinha(row: Linha): Cofrinho {
  return {
    id: row.id,
    chatId: row.chat_id,
    nome: row.nome,
    metaCentavos: inteiro(row.meta_centavos),
    saldoCentavos: inteiro(row.saldo_centavos),
    status: row.status === "encerrado" ? "encerrado" : "ativo",
    criadoEm: typeof row.criado_em === "string" ? row.criado_em : new Date(row.criado_em).toISOString(),
  };
}

async function lerSql(id: string): Promise<Cofrinho | undefined> {
  const rows = await sql<Linha>("select * from cofrinhos where id = $1", [id]);
  return rows[0] === undefined ? undefined : deLinha(rows[0]);
}

async function listarSql(chatId: string): Promise<Cofrinho[]> {
  const rows = await sql<Linha>("select * from cofrinhos where chat_id = $1 order by criado_em asc", [chatId]);
  return rows.map(deLinha);
}

async function criarSql(
  chatId: string,
  nome: string,
  metaCentavos: number,
): Promise<{ ok: true; cofrinho: Cofrinho } | { ok: false; motivo: "limite" | "nome_em_uso" | "sem_conta" }> {
  return comSql(async (query) => {
    const conta = await query<{ chat_id: string }>("select chat_id from contas where chat_id = $1 for update", [chatId]);
    if (conta[0] === undefined) return { ok: false as const, motivo: "sem_conta" as const };
    const ativos = await query<{ id: string; nome: string }>(
      "select id, nome from cofrinhos where chat_id = $1 and status = 'ativo' for update",
      [chatId],
    );
    if (ativos.length >= LIMITE_COFRINHOS) return { ok: false as const, motivo: "limite" as const };
    if (ativos.some((item) => item.nome.toLowerCase() === nome.toLowerCase())) {
      return { ok: false as const, motivo: "nome_em_uso" as const };
    }
    const id = novoIdCofrinho();
    const agora = new Date().toISOString();
    await query(
      "insert into cofrinhos (id, chat_id, nome, meta_centavos, saldo_centavos, status, criado_em) values ($1,$2,$3,$4,0,'ativo',$5)",
      [id, chatId, nome, metaCentavos, agora],
    );
    return {
      ok: true as const,
      cofrinho: { id, chatId, nome, metaCentavos, saldoCentavos: 0, status: "ativo" as const, criadoEm: agora },
    };
  });
}

async function atualizarSql(
  chatId: string,
  id: string,
  patch: { nome?: string; metaCentavos?: number },
): Promise<{ ok: true; cofrinho: Cofrinho } | { ok: false; motivo: "nao_acha" | "nome_em_uso" | "encerrado" }> {
  return comSql(async (query) => {
    const rows = await query<Linha>("select * from cofrinhos where id = $1 for update", [id]);
    const atual = rows[0];
    if (atual === undefined || atual.chat_id !== chatId) return { ok: false as const, motivo: "nao_acha" as const };
    if (atual.status !== "ativo") return { ok: false as const, motivo: "encerrado" as const };
    const nome = patch.nome ?? atual.nome;
    if (nome.toLowerCase() !== atual.nome.toLowerCase()) {
      const outros = await query<{ id: string }>(
        "select id from cofrinhos where chat_id = $1 and status = 'ativo' and lower(nome) = lower($2) and id <> $3",
        [chatId, nome, id],
      );
      if (outros.length > 0) return { ok: false as const, motivo: "nome_em_uso" as const };
    }
    const meta = patch.metaCentavos ?? inteiro(atual.meta_centavos);
    await query("update cofrinhos set nome = $2, meta_centavos = $3 where id = $1", [id, nome, meta]);
    return { ok: true as const, cofrinho: { ...deLinha(atual), nome, metaCentavos: meta } };
  });
}

async function encerrarSql(
  chatId: string,
  id: string,
): Promise<{ ok: true; cofrinho: Cofrinho } | { ok: false; motivo: "nao_acha" | "com_saldo" | "encerrado" }> {
  return comSql(async (query) => {
    const rows = await query<Linha>("select * from cofrinhos where id = $1 for update", [id]);
    const atual = rows[0];
    if (atual === undefined || atual.chat_id !== chatId) return { ok: false as const, motivo: "nao_acha" as const };
    if (atual.status !== "ativo") return { ok: false as const, motivo: "encerrado" as const };
    if (inteiro(atual.saldo_centavos) > 0) return { ok: false as const, motivo: "com_saldo" as const };
    await query("update cofrinhos set status = 'encerrado' where id = $1", [id]);
    return { ok: true as const, cofrinho: { ...deLinha(atual), status: "encerrado" } };
  });
}
