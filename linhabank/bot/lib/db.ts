import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Linha = Record<string, unknown>;
export type QueryFn = <T extends Linha = Linha>(texto: string, params?: unknown[]) => Promise<T[]>;

type PgPool = {
  connect(): Promise<{
    query: (texto: string, params?: unknown[]) => Promise<{ rows: Linha[] }>;
    release(): void;
  }>;
  query: (texto: string, params?: unknown[]) => Promise<{ rows: Linha[] }>;
};

type PgliteDb = {
  exec(sql: string): Promise<unknown>;
  query<T>(texto: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const caminhoLocal = process.env.LINHABANK_DB_PATH?.trim() ?? "";

let pool: PgPool | undefined;
let local: Promise<PgliteDb> | undefined;
let fila: Promise<unknown> = Promise.resolve();

function pastaMigracoes(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../migrations");
}

export function sqlDisponivel(): boolean {
  return databaseUrl.length > 0 || caminhoLocal.length > 0 || process.env.LINHABANK_SQL === "memoria";
}

async function arquivosMigracao(): Promise<string[]> {
  const nomes = await readdir(pastaMigracoes()).catch(() => []);
  return nomes.filter((nome) => nome.endsWith(".sql")).sort();
}

async function pglite(): Promise<PgliteDb> {
  local ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const db =
      process.env.LINHABANK_SQL === "memoria" || caminhoLocal.length === 0
        ? new PGlite()
        : new PGlite(caminhoLocal);
    for (const arquivo of await arquivosMigracao()) {
      await db.exec(await readFile(join(pastaMigracoes(), arquivo), "utf8"));
    }
    return db as PgliteDb;
  })().catch((erro: unknown) => {
    local = undefined;
    throw erro;
  });
  return local;
}

async function postgres(): Promise<PgPool> {
  if (pool !== undefined) return pool;
  const pg = await import("pg");
  pool = new pg.default.Pool({ connectionString: databaseUrl, max: 5 }) as unknown as PgPool;
  return pool;
}

export async function sql<T extends Linha = Linha>(texto: string, params: unknown[] = []): Promise<T[]> {
  if (databaseUrl.length > 0) {
    return (await (await postgres()).query(texto, params)).rows as T[];
  }
  const db = await pglite();
  return (await db.query<T>(texto, params)).rows;
}

export async function comSql<T>(trabalho: (query: QueryFn) => Promise<T>): Promise<T> {
  if (databaseUrl.length > 0) {
    const client = await (await postgres()).connect();
    try {
      await client.query("begin");
      const query: QueryFn = async <T extends Linha = Linha>(texto: string, params: unknown[] = []) =>
        (await client.query(texto, params)).rows as T[];
      const resultado = await trabalho(query);
      await client.query("commit");
      return resultado;
    } catch (erro) {
      await client.query("rollback");
      throw erro;
    } finally {
      client.release();
    }
  }
  const db = await pglite();
  const rodada = fila.then(async () => {
    await db.query("begin");
    try {
      const query: QueryFn = async <T extends Linha = Linha>(texto: string, params: unknown[] = []) =>
        (await db.query(texto, params)).rows as T[];
      const resultado = await trabalho(query);
      await db.query("commit");
      return resultado;
    } catch (erro) {
      await db.query("rollback");
      throw erro;
    }
  });
  fila = rodada.then(
    () => undefined,
    () => undefined,
  );
  return rodada;
}

export async function migrarPostgres(): Promise<void> {
  if (databaseUrl.length === 0) return;
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED?.trim() || databaseUrl });
  await client.connect();
  try {
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    const feitos = new Set(
      ((await client.query("select name from schema_migrations")).rows as { name: string }[]).map((row) => row.name),
    );
    for (const arquivo of await arquivosMigracao()) {
      if (feitos.has(arquivo)) continue;
      await client.query("begin");
      try {
        await client.query(await readFile(join(pastaMigracoes(), arquivo), "utf8"));
        await client.query("insert into schema_migrations (name) values ($1)", [arquivo]);
        await client.query("commit");
      } catch (erro) {
        await client.query("rollback");
        throw erro;
      }
    }
  } finally {
    await client.end();
  }
}
