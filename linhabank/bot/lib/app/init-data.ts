import { createHmac, timingSafeEqual } from "node:crypto";

const LIMITE_IDADE_S = 86_400;

export type ClienteApp = {
  chatId: string;
  nome: string;
};

export function validarInitData(initData: string, token: string, agoraMs = Date.now()): ClienteApp | undefined {
  if (initData.length === 0 || token.length === 0) return undefined;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (hash === null || !/^[0-9a-f]{64}$/i.test(hash)) return undefined;
  params.delete("hash");
  const pares = [...params.entries()].map(([chave, valor]) => `${chave}=${valor}`);
  pares.sort();
  const dataCheck = pares.join("\n");
  const segredo = createHmac("sha256", "WebAppData").update(token).digest();
  const calculado = createHmac("sha256", segredo).update(dataCheck).digest("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calculado, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || agoraMs / 1000 - authDate > LIMITE_IDADE_S || authDate > agoraMs / 1000 + 60) {
    return undefined;
  }
  const bruto = params.get("user");
  if (bruto === null) return undefined;
  let user: { id?: unknown; first_name?: unknown };
  try {
    user = JSON.parse(bruto) as { id?: unknown; first_name?: unknown };
  } catch {
    return undefined;
  }
  if (typeof user.id !== "number" || !Number.isInteger(user.id) || user.id <= 0) return undefined;
  const nome = typeof user.first_name === "string" ? user.first_name.trim().slice(0, 40) : "";
  return { chatId: String(user.id), nome: nome.length > 0 ? nome : "cliente" };
}

export function initDataDoPedido(request: Request): string | undefined {
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("tma ")) {
    const valor = auth.slice(4).trim();
    if (valor.length > 0) return valor;
  }
  const header = request.headers.get("x-telegram-init-data")?.trim();
  return header !== undefined && header.length > 0 ? header : undefined;
}

export function clienteDoPedido(request: Request): ClienteApp | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const initData = initDataDoPedido(request);
  if (initData !== undefined) {
    const cliente = validarInitData(initData, token);
    if (cliente !== undefined) return cliente;
    return undefined;
  }
  return clienteDev(request);
}

function clienteDev(request: Request): ClienteApp | undefined {
  const chatId = process.env.LINHABANK_APP_DEV_CHAT?.trim();
  if (chatId === undefined || chatId.length === 0) return undefined;
  let host: string;
  try {
    host = new URL(request.url).hostname;
  } catch {
    return undefined;
  }
  if (host !== "127.0.0.1" && host !== "localhost") return undefined;
  return { chatId, nome: "cliente" };
}

export function montarInitData(token: string, user: { id: number; first_name: string }, agoraS = Math.floor(Date.now() / 1000)): string {
  const params = new URLSearchParams({
    auth_date: String(agoraS),
    query_id: "AAEteste",
    user: JSON.stringify({ id: user.id, first_name: user.first_name }),
  });
  const pares = [...params.entries()].map(([chave, valor]) => `${chave}=${valor}`);
  pares.sort();
  const segredo = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", segredo).update(pares.join("\n")).digest("hex");
  params.set("hash", hash);
  return params.toString();
}
