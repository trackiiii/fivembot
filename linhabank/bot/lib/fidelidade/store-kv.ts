import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { comTravas } from "../trava.js";
import { novoId } from "./ids.js";
import type {
  AuditoriaAdmin,
  CarteiraLbcoins,
  HistoricoXp,
  Indicacao,
  MovimentoLbcoins,
  RecompensaIndicacao,
  StatusIndicacao,
  TipoLbcoins,
  XpUsuario,
} from "./tipos.js";

const INDICE_CODIGOS = "linhabank:lb:codigos";
const INDICE_PENDENTES = "linhabank:lb:pendentes";
const INDICE_TX = "linhabank:lb:tx:indice";
const INDICE_AUDIT = "linhabank:lb:audit:indice";

function obj(valor: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

function lista(valor: JsonValue | undefined): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string");
}

async function pushIndice(kv: HostKvApi, chave: string, id: string, limite = 20_000): Promise<void> {
  const atual = lista(await kv.get(chave));
  if (atual.includes(id)) return;
  atual.unshift(id);
  await kv.put(chave, atual.slice(0, limite));
}

export function chaveCarteira(chatId: string): string {
  return `linhabank:lb:wallet:${chatId}`;
}
export function chaveCodigo(codigo: string): string {
  return `linhabank:lb:codigo:${codigo}`;
}
export function chaveTx(id: string): string {
  return `linhabank:lb:tx:${id}`;
}
export function chaveTxConta(chatId: string): string {
  return `linhabank:lb:tx:conta:${chatId}`;
}
export function chaveIdem(chave: string): string {
  return `linhabank:lb:idem:${chave}`;
}
export function chaveXp(chatId: string): string {
  return `linhabank:lb:xp:${chatId}`;
}
export function chaveXpHist(chatId: string): string {
  return `linhabank:lb:xp:hist:${chatId}`;
}
export function chaveIndicacao(id: string): string {
  return `linhabank:lb:ref:${id}`;
}
export function chaveIndicacaoIndicado(chatId: string): string {
  return `linhabank:lb:ref:indicado:${chatId}`;
}
export function chaveIndicacoesDe(chatId: string): string {
  return `linhabank:lb:ref:de:${chatId}`;
}
export function chaveStart(chatId: string): string {
  return `linhabank:lb:start:${chatId}`;
}
export function chaveReward(referralId: string): string {
  return `linhabank:lb:reward:${referralId}`;
}
export function chaveAudit(id: string): string {
  return `linhabank:lb:audit:${id}`;
}

export function lerCarteira(valor: JsonValue | undefined): CarteiraLbcoins | undefined {
  const item = obj(valor);
  if (item === undefined) return undefined;
  if (typeof item.chatId !== "string" || typeof item.codigoIndicacao !== "string") return undefined;
  return {
    chatId: item.chatId,
    saldo: Number(item.saldo) || 0,
    totalRecebido: Number(item.totalRecebido) || 0,
    totalUtilizado: Number(item.totalUtilizado) || 0,
    recompensasBloqueadas: item.recompensasBloqueadas === true,
    codigoIndicacao: item.codigoIndicacao,
    criadoEm: typeof item.criadoEm === "string" ? item.criadoEm : new Date().toISOString(),
    versao: Number(item.versao) || 1,
  };
}

export function lerMovimento(valor: JsonValue | undefined): MovimentoLbcoins | undefined {
  const item = obj(valor);
  if (item === undefined) return undefined;
  if (typeof item.id !== "string" || typeof item.chatId !== "string" || typeof item.idempotencyKey !== "string") {
    return undefined;
  }
  return {
    id: item.id,
    chatId: item.chatId,
    tipo: item.tipo as TipoLbcoins,
    quantidade: Number(item.quantidade) || 0,
    descricao: typeof item.descricao === "string" ? item.descricao : "",
    origem: typeof item.origem === "string" ? item.origem : "",
    status: item.status === "bloqueado" ? "bloqueado" : "confirmado",
    idempotencyKey: item.idempotencyKey,
    em: typeof item.em === "string" ? item.em : new Date().toISOString(),
  };
}

export function lerIndicacao(valor: JsonValue | undefined): Indicacao | undefined {
  const item = obj(valor);
  if (item === undefined) return undefined;
  if (typeof item.id !== "string" || typeof item.indicadorChatId !== "string" || typeof item.indicadoChatId !== "string") {
    return undefined;
  }
  const status = item.status;
  if (status !== "pendente" && status !== "aprovada" && status !== "rejeitada") return undefined;
  return {
    id: item.id,
    indicadorChatId: item.indicadorChatId,
    indicadoChatId: item.indicadoChatId,
    codigo: typeof item.codigo === "string" ? item.codigo : "",
    status,
    motivo: typeof item.motivo === "string" ? item.motivo : undefined,
    criadoEm: typeof item.criadoEm === "string" ? item.criadoEm : new Date().toISOString(),
    decididoEm: typeof item.decididoEm === "string" ? item.decididoEm : undefined,
    decididoPor: typeof item.decididoPor === "string" ? item.decididoPor : undefined,
  };
}

export function lerXp(valor: JsonValue | undefined): XpUsuario | undefined {
  const item = obj(valor);
  if (item === undefined || typeof item.chatId !== "string") return undefined;
  const categoria = item.categoria === "prata" || item.categoria === "ouro" ? item.categoria : "bronze";
  return {
    chatId: item.chatId,
    xp: Number(item.xp) || 0,
    categoria,
    categoriaEm: typeof item.categoriaEm === "string" ? item.categoriaEm : new Date().toISOString(),
    versao: Number(item.versao) || 1,
  };
}

export async function gravarCarteiraKv(kv: HostKvApi, carteira: CarteiraLbcoins): Promise<void> {
  await kv.put(chaveCarteira(carteira.chatId), {
    chatId: carteira.chatId,
    saldo: carteira.saldo,
    totalRecebido: carteira.totalRecebido,
    totalUtilizado: carteira.totalUtilizado,
    recompensasBloqueadas: carteira.recompensasBloqueadas,
    codigoIndicacao: carteira.codigoIndicacao,
    criadoEm: carteira.criadoEm,
    versao: carteira.versao,
  });
  await kv.put(chaveCodigo(carteira.codigoIndicacao), carteira.chatId);
  await pushIndice(kv, INDICE_CODIGOS, carteira.codigoIndicacao, 50_000);
}

export async function chatIdDoCodigoKv(kv: HostKvApi, codigo: string): Promise<string | undefined> {
  const valor = await kv.get(chaveCodigo(codigo));
  return typeof valor === "string" ? valor : undefined;
}

export async function lerCarteiraKv(kv: HostKvApi, chatId: string): Promise<CarteiraLbcoins | undefined> {
  return lerCarteira(await kv.get(chaveCarteira(chatId)));
}

export async function aplicarLbcoinsKv(
  kv: HostKvApi,
  pedido: {
    chatId: string;
    tipo: TipoLbcoins;
    quantidade: number;
    descricao: string;
    origem: string;
    idempotencyKey: string;
    admin?: boolean;
  },
): Promise<
  | { ok: true; carteira: CarteiraLbcoins; movimento: MovimentoLbcoins; repetido: boolean }
  | { ok: false; motivo: "saldo_insuficiente" | "bloqueado" | "quantidade_invalida" }
> {
  if (!Number.isSafeInteger(pedido.quantidade) || pedido.quantidade === 0) {
    return { ok: false, motivo: "quantidade_invalida" };
  }
  return comTravas(kv, [pedido.chatId], async () => {
    const idem = obj(await kv.get(chaveIdem(pedido.idempotencyKey)));
    if (idem !== undefined && typeof idem.movimentoId === "string") {
      const movimento = lerMovimento(await kv.get(chaveTx(idem.movimentoId)));
      const carteira = await lerCarteiraKv(kv, pedido.chatId);
      if (movimento !== undefined && carteira !== undefined) {
        return { ok: true as const, carteira, movimento, repetido: true };
      }
    }
    const carteira = await lerCarteiraKv(kv, pedido.chatId);
    if (carteira === undefined) return { ok: false as const, motivo: "bloqueado" as const };
    if (carteira.recompensasBloqueadas && pedido.quantidade > 0 && pedido.admin !== true) {
      return { ok: false as const, motivo: "bloqueado" as const };
    }
    const novoSaldo = carteira.saldo + pedido.quantidade;
    if (novoSaldo < 0) return { ok: false as const, motivo: "saldo_insuficiente" as const };
    const movimento: MovimentoLbcoins = {
      id: novoId("lbtx"),
      chatId: pedido.chatId,
      tipo: pedido.tipo,
      quantidade: pedido.quantidade,
      descricao: pedido.descricao.slice(0, 240),
      origem: pedido.origem.slice(0, 80),
      status: "confirmado",
      idempotencyKey: pedido.idempotencyKey,
      em: new Date().toISOString(),
    };
    const atualizada: CarteiraLbcoins = {
      ...carteira,
      saldo: novoSaldo,
      totalRecebido: carteira.totalRecebido + (pedido.quantidade > 0 ? pedido.quantidade : 0),
      totalUtilizado: carteira.totalUtilizado + (pedido.quantidade < 0 ? -pedido.quantidade : 0),
      versao: carteira.versao + 1,
    };
    await kv.put(chaveTx(movimento.id), {
      id: movimento.id,
      chatId: movimento.chatId,
      tipo: movimento.tipo,
      quantidade: movimento.quantidade,
      descricao: movimento.descricao,
      origem: movimento.origem,
      status: movimento.status,
      idempotencyKey: movimento.idempotencyKey,
      em: movimento.em,
    });
    await kv.put(chaveIdem(pedido.idempotencyKey), { movimentoId: movimento.id });
    await pushIndice(kv, chaveTxConta(pedido.chatId), movimento.id);
    await pushIndice(kv, INDICE_TX, movimento.id);
    await gravarCarteiraKv(kv, atualizada);
    return { ok: true as const, carteira: atualizada, movimento, repetido: false };
  });
}

export async function historicoLbcoinsKv(kv: HostKvApi, chatId: string, limite = 30): Promise<MovimentoLbcoins[]> {
  const ids = lista(await kv.get(chaveTxConta(chatId)));
  const saida: MovimentoLbcoins[] = [];
  for (const id of ids.slice(0, limite)) {
    const item = lerMovimento(await kv.get(chaveTx(id)));
    if (item !== undefined) saida.push(item);
  }
  return saida;
}

export async function gravarXpKv(kv: HostKvApi, xp: XpUsuario): Promise<void> {
  await kv.put(chaveXp(xp.chatId), {
    chatId: xp.chatId,
    xp: xp.xp,
    categoria: xp.categoria,
    categoriaEm: xp.categoriaEm,
    versao: xp.versao,
  });
}

export async function lerXpKv(kv: HostKvApi, chatId: string): Promise<XpUsuario | undefined> {
  return lerXp(await kv.get(chaveXp(chatId)));
}

export async function gravarHistoricoXpKv(kv: HostKvApi, item: HistoricoXp): Promise<void> {
  const atual = lista(await kv.get(chaveXpHist(item.chatId)));
  const payload = {
    id: item.id,
    chatId: item.chatId,
    xpAnterior: item.xpAnterior,
    xpNovo: item.xpNovo,
    categoriaAnterior: item.categoriaAnterior,
    categoriaNova: item.categoriaNova,
    motivo: item.motivo,
    em: item.em,
  };
  await kv.put(`${chaveXpHist(item.chatId)}:${item.id}`, payload);
  atual.unshift(item.id);
  await kv.put(chaveXpHist(item.chatId), atual.slice(0, 80));
}

export async function historicoXpKv(kv: HostKvApi, chatId: string, limite = 12): Promise<HistoricoXp[]> {
  const ids = lista(await kv.get(chaveXpHist(chatId)));
  const saida: HistoricoXp[] = [];
  for (const id of ids.slice(0, limite)) {
    const item = obj(await kv.get(`${chaveXpHist(chatId)}:${id}`));
    if (item === undefined || typeof item.id !== "string") continue;
    saida.push({
      id: item.id,
      chatId: typeof item.chatId === "string" ? item.chatId : chatId,
      xpAnterior: Number(item.xpAnterior) || 0,
      xpNovo: Number(item.xpNovo) || 0,
      categoriaAnterior: item.categoriaAnterior === "prata" || item.categoriaAnterior === "ouro" ? item.categoriaAnterior : "bronze",
      categoriaNova: item.categoriaNova === "prata" || item.categoriaNova === "ouro" ? item.categoriaNova : "bronze",
      motivo: typeof item.motivo === "string" ? item.motivo : "",
      em: typeof item.em === "string" ? item.em : new Date().toISOString(),
    });
  }
  return saida;
}

export async function gravarIndicacaoKv(kv: HostKvApi, item: Indicacao): Promise<void> {
  const payload: Record<string, JsonValue> = {
    id: item.id,
    indicadorChatId: item.indicadorChatId,
    indicadoChatId: item.indicadoChatId,
    codigo: item.codigo,
    status: item.status,
    criadoEm: item.criadoEm,
  };
  if (item.motivo !== undefined) payload.motivo = item.motivo;
  if (item.decididoEm !== undefined) payload.decididoEm = item.decididoEm;
  if (item.decididoPor !== undefined) payload.decididoPor = item.decididoPor;
  await kv.put(chaveIndicacao(item.id), payload);
  await kv.put(chaveIndicacaoIndicado(item.indicadoChatId), item.id);
  await pushIndice(kv, chaveIndicacoesDe(item.indicadorChatId), item.id);
  if (item.status === "pendente") await pushIndice(kv, INDICE_PENDENTES, item.id);
}

export async function lerIndicacaoKv(kv: HostKvApi, id: string): Promise<Indicacao | undefined> {
  return lerIndicacao(await kv.get(chaveIndicacao(id)));
}

export async function indicacaoDoIndicadoKv(kv: HostKvApi, chatId: string): Promise<Indicacao | undefined> {
  const id = await kv.get(chaveIndicacaoIndicado(chatId));
  if (typeof id !== "string") return undefined;
  return lerIndicacaoKv(kv, id);
}

export async function indicacoesDeKv(kv: HostKvApi, chatId: string): Promise<Indicacao[]> {
  const ids = lista(await kv.get(chaveIndicacoesDe(chatId)));
  const saida: Indicacao[] = [];
  for (const id of ids) {
    const item = await lerIndicacaoKv(kv, id);
    if (item !== undefined) saida.push(item);
  }
  return saida;
}

export async function indicacoesPendentesKv(kv: HostKvApi, limite = 40): Promise<Indicacao[]> {
  const ids = lista(await kv.get(INDICE_PENDENTES));
  const saida: Indicacao[] = [];
  for (const id of ids) {
    const item = await lerIndicacaoKv(kv, id);
    if (item !== undefined && item.status === "pendente") saida.push(item);
    if (saida.length >= limite) break;
  }
  return saida;
}

export async function gravarRewardKv(kv: HostKvApi, item: RecompensaIndicacao): Promise<void> {
  await kv.put(chaveReward(item.referralId), {
    id: item.id,
    referralId: item.referralId,
    chatId: item.chatId,
    quantidade: item.quantidade,
    transacaoId: item.transacaoId,
    em: item.em,
  });
}

export async function lerRewardKv(kv: HostKvApi, referralId: string): Promise<RecompensaIndicacao | undefined> {
  const item = obj(await kv.get(chaveReward(referralId)));
  if (item === undefined || typeof item.id !== "string") return undefined;
  return {
    id: item.id,
    referralId: typeof item.referralId === "string" ? item.referralId : referralId,
    chatId: typeof item.chatId === "string" ? item.chatId : "",
    quantidade: Number(item.quantidade) || 0,
    transacaoId: typeof item.transacaoId === "string" ? item.transacaoId : "",
    em: typeof item.em === "string" ? item.em : new Date().toISOString(),
  };
}

export async function gravarStartKv(kv: HostKvApi, chatId: string, codigo: string): Promise<void> {
  await kv.put(chaveStart(chatId), { codigo, em: new Date().toISOString() });
}

export async function lerStartKv(kv: HostKvApi, chatId: string): Promise<string | undefined> {
  const item = obj(await kv.get(chaveStart(chatId)));
  return typeof item?.codigo === "string" ? item.codigo : undefined;
}

export async function apagarStartKv(kv: HostKvApi, chatId: string): Promise<void> {
  await kv.delete(chaveStart(chatId));
}

export async function gravarAuditoriaKv(kv: HostKvApi, item: AuditoriaAdmin): Promise<void> {
  const payload: Record<string, JsonValue> = {
    id: item.id,
    operadorChatId: item.operadorChatId,
    acao: item.acao,
    motivo: item.motivo,
    em: item.em,
  };
  if (item.alvoChatId !== undefined) payload.alvoChatId = item.alvoChatId;
  if (item.valorAnterior !== undefined) payload.valorAnterior = item.valorAnterior;
  if (item.valorNovo !== undefined) payload.valorNovo = item.valorNovo;
  await kv.put(chaveAudit(item.id), payload);
  await pushIndice(kv, INDICE_AUDIT, item.id, 400);
}

export async function listarAuditoriaKv(kv: HostKvApi, limite = 20): Promise<AuditoriaAdmin[]> {
  const ids = lista(await kv.get(INDICE_AUDIT));
  const saida: AuditoriaAdmin[] = [];
  for (const id of ids.slice(0, limite)) {
    const item = obj(await kv.get(chaveAudit(id)));
    if (item === undefined || typeof item.id !== "string") continue;
    saida.push({
      id: item.id,
      operadorChatId: typeof item.operadorChatId === "string" ? item.operadorChatId : "",
      acao: typeof item.acao === "string" ? item.acao : "",
      alvoChatId: typeof item.alvoChatId === "string" ? item.alvoChatId : undefined,
      motivo: typeof item.motivo === "string" ? item.motivo : "",
      valorAnterior: typeof item.valorAnterior === "string" ? item.valorAnterior : undefined,
      valorNovo: typeof item.valorNovo === "string" ? item.valorNovo : undefined,
      em: typeof item.em === "string" ? item.em : new Date().toISOString(),
    });
  }
  return saida;
}

export function filtrarPendentes(status: StatusIndicacao, indice: string[]): string[] {
  return status === "pendente" ? indice : indice;
}
