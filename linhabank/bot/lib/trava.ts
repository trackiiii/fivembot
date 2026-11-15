import { randomInt } from "node:crypto";

import type { HostKvApi } from "@grok/agent-sdk";

const ESPERA_MS = 20_000;

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}

function expirou(valor: string, agora: number): boolean {
  const ms = Number(valor.split(":")[0]);
  return !Number.isFinite(ms) || agora - ms > ESPERA_MS;
}

async function adquirir(kv: HostKvApi, chave: string): Promise<string | undefined> {
  const dono = `${Date.now()}:${randomInt(1_000_000_000)}`;
  for (let tentativa = 0; tentativa < 40; tentativa += 1) {
    const atual = await kv.get(chave);
    const livre = typeof atual !== "string" || expirou(atual, Date.now());
    if (livre) {
      await kv.put(chave, dono);
      if ((await kv.get(chave)) === dono) return dono;
    }
    await esperar(15 + tentativa * 8);
  }
  return undefined;
}

async function soltar(kv: HostKvApi, chave: string, dono: string): Promise<void> {
  if ((await kv.get(chave)) === dono) await kv.delete(chave);
}

export async function comTravas<T>(kv: HostKvApi, ids: string[], trabalho: () => Promise<T>): Promise<T> {
  const chaves = [...new Set(ids)]
    .sort()
    .map((id) => `linhabank:trava:conta:${id}`);
  const donos: { chave: string; dono: string }[] = [];
  try {
    for (const chave of chaves) {
      const dono = await adquirir(kv, chave);
      if (dono === undefined) return trabalho();
      donos.push({ chave, dono });
    }
    return await trabalho();
  } finally {
    for (const item of donos.reverse()) await soltar(kv, item.chave, item.dono);
  }
}
