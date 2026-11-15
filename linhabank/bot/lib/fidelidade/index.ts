import type { HostKvApi } from "@grok/agent-sdk";

import { lerConta } from "../banco.js";
import { configAtual } from "../config.js";
import { sqlDisponivel } from "../db.js";
import { codigoIndicacaoValido, normalizarCodigo, novoCodigoIndicacao, novoId } from "./ids.js";
import {
  apagarStartKv,
  aplicarLbcoinsKv,
  chatIdDoCodigoKv,
  gravarAuditoriaKv,
  gravarCarteiraKv,
  gravarHistoricoXpKv,
  gravarIndicacaoKv,
  gravarRewardKv,
  gravarStartKv,
  gravarXpKv,
  historicoLbcoinsKv,
  historicoXpKv,
  indicacaoDoIndicadoKv,
  indicacoesDeKv,
  indicacoesPendentesKv,
  lerCarteiraKv,
  lerIndicacaoKv,
  lerRewardKv,
  lerStartKv,
  lerXpKv,
  listarAuditoriaKv,
} from "./store-kv.js";
import {
  aplicarLbcoinsSql,
  chatIdDoCodigoSql,
  gravarAuditoriaSql,
  gravarHistoricoXpSql,
  historicoLbcoinsSql,
  historicoXpSql,
  indicacaoDoIndicadoSql,
  indicacoesDeSql,
  indicacoesPendentesSql,
  lerCarteiraSql,
  lerIndicacaoSql,
  lerRewardSql,
  lerXpSql,
  listarAuditoriaSql,
  upsertCarteiraSql,
  upsertIndicacaoSql,
  upsertRewardSql,
  upsertXpSql,
} from "./store-sql.js";
import type {
  AuditoriaAdmin,
  CarteiraLbcoins,
  CategoriaClube,
  CriterioIndicacao,
  Indicacao,
  MovimentoLbcoins,
  ResumoClube,
  ResultadoCredito,
  TipoLbcoins,
  XpUsuario,
} from "./tipos.js";

export type { CategoriaClube, CriterioIndicacao, Indicacao, MovimentoLbcoins, ResumoClube, ResultadoCredito };
export { codigoIndicacaoValido, normalizarCodigo } from "./ids.js";

let usernameCache: string | undefined;

export function categoriaDeXp(xp: number, prata = configAtual().xpPrata, ouro = configAtual().xpOuro): CategoriaClube {
  if (xp >= ouro) return "ouro";
  if (xp >= prata) return "prata";
  return "bronze";
}

export function rotuloCategoria(categoria: CategoriaClube): string {
  if (categoria === "ouro") return "Ouro";
  if (categoria === "prata") return "Prata";
  return "Bronze";
}

export function beneficiosDa(categoria: CategoriaClube): string[] {
  const cfg = configAtual();
  const bronze = [
    "Participação no LINHABANK INDIQUE E GANHE.",
    "Acúmulo de LBcoins. LBcoins não são dinheiro e não saem por PIX.",
  ];
  if (categoria === "bronze") return bronze;
  const prata = [...bronze];
  if (cfg.beneficioPrata.trim().length > 0) prata.push(cfg.beneficioPrata.trim());
  else prata.push("Bônus extras só quando a gerência configurar um valor maior que zero.");
  if (categoria === "prata") return prata;
  const ouro = [...prata];
  if (cfg.beneficioOuro.trim().length > 0) ouro.push(cfg.beneficioOuro.trim());
  else ouro.push("Bônus especiais só quando a gerência configurar. Sem fila especial neste chat ainda.");
  return ouro;
}

export async function usernameDoBot(): Promise<string> {
  if (usernameCache !== undefined) return usernameCache;
  const env = (process.env.TELEGRAM_BOT_USERNAME ?? "").trim().replace(/^@/, "");
  if (/^[A-Za-z0-9_]{5,32}$/.test(env)) {
    usernameCache = env;
    return env;
  }
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token !== undefined && token.length > 0) {
    try {
      const resposta = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(4000) });
      const json = (await resposta.json()) as { ok?: boolean; result?: { username?: string } };
      const nome = json.result?.username ?? "";
      if (/^[A-Za-z0-9_]{5,32}$/.test(nome)) {
        usernameCache = nome;
        return nome;
      }
    } catch {
      /* usa o padrão */
    }
  }
  usernameCache = "linhabank_bot";
  return usernameCache;
}

export function linkIndicacao(codigo: string, username: string): string {
  return `https://t.me/${username}?start=${codigo}`;
}

export async function garantirFidelidade(kv: HostKvApi, chatId: string): Promise<{ carteira: CarteiraLbcoins; xp: XpUsuario } | undefined> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return undefined;
  let carteira = sqlDisponivel() ? await lerCarteiraSql(chatId) : await lerCarteiraKv(kv, chatId);
  if (carteira === undefined) {
    const codigo = await codigoLivre(kv);
    carteira = {
      chatId,
      saldo: 0,
      totalRecebido: 0,
      totalUtilizado: 0,
      recompensasBloqueadas: false,
      codigoIndicacao: codigo,
      criadoEm: conta.aceitouEm || new Date().toISOString(),
      versao: 1,
    };
    if (sqlDisponivel()) await upsertCarteiraSql(carteira);
    else await gravarCarteiraKv(kv, carteira);
  }
  let xp = sqlDisponivel() ? await lerXpSql(chatId) : await lerXpKv(kv, chatId);
  const agora = new Date().toISOString();
  if (xp === undefined) {
    xp = { chatId, xp: 0, categoria: "bronze", categoriaEm: agora, versao: 1 };
    if (sqlDisponivel()) await upsertXpSql(xp);
    else await gravarXpKv(kv, xp);
  } else {
    const categoria = categoriaDeXp(xp.xp);
    if (categoria !== xp.categoria) {
      const anterior = xp.categoria;
      xp = { ...xp, categoria, categoriaEm: agora, versao: xp.versao + 1 };
      if (sqlDisponivel()) await upsertXpSql(xp);
      else await gravarXpKv(kv, xp);
      await registrarHistoricoXp(kv, {
        chatId,
        xpAnterior: xp.xp,
        xpNovo: xp.xp,
        categoriaAnterior: anterior,
        categoriaNova: categoria,
        motivo: "Reclassificação pelos limites vigentes.",
      });
    }
  }
  return { carteira, xp };
}

export async function capturarStartIndicacao(kv: HostKvApi, chatId: string, payload: string): Promise<void> {
  if ((await lerConta(kv, chatId)) !== undefined) return;
  const codigo = normalizarCodigo(payload);
  if (!codigoIndicacaoValido(codigo)) return;
  const dono = await chatIdDoCodigo(kv, codigo);
  if (dono === undefined || dono === chatId) return;
  await gravarStartKv(kv, chatId, codigo);
}

export async function aoAbrirContaFidelidade(
  kv: HostKvApi,
  chatId: string,
): Promise<{ avisoIndicador?: { chatId: string; texto: string } }> {
  const aberto = await garantirFidelidade(kv, chatId);
  if (aberto === undefined) return {};
  const codigo = await lerStartKv(kv, chatId);
  await apagarStartKv(kv, chatId);
  if (codigo === undefined) return {};
  const vinculo = await vincularIndicacao(kv, chatId, codigo);
  if (!vinculo.ok) return {};
  if (configAtual().indicacaoCriterio === "conta_aberta") {
    const aprovado = await decidirIndicacao(kv, vinculo.indicacao.id, "aprovada", chatId, "Cadastro completo neste chat.");
    if (aprovado.ok && aprovado.avisoIndicador !== undefined) return { avisoIndicador: aprovado.avisoIndicador };
  }
  return {};
}

export async function vincularIndicacao(
  kv: HostKvApi,
  indicadoChatId: string,
  codigoBruto: string,
): Promise<{ ok: true; indicacao: Indicacao } | { ok: false; motivo: string }> {
  const codigo = normalizarCodigo(codigoBruto);
  if (!codigoIndicacaoValido(codigo)) return { ok: false, motivo: "codigo_invalido" };
  const indicadorChatId = await chatIdDoCodigo(kv, codigo);
  if (indicadorChatId === undefined) return { ok: false, motivo: "codigo_inexistente" };
  if (indicadorChatId === indicadoChatId) return { ok: false, motivo: "autoindicacao" };
  const existente = sqlDisponivel()
    ? await indicacaoDoIndicadoSql(indicadoChatId)
    : await indicacaoDoIndicadoKv(kv, indicadoChatId);
  if (existente !== undefined) return { ok: false, motivo: "ja_indicado" };
  const indicador = await lerConta(kv, indicadorChatId);
  const indicado = await lerConta(kv, indicadoChatId);
  if (indicador === undefined || indicado === undefined) return { ok: false, motivo: "sem_conta" };
  const item: Indicacao = {
    id: novoId("ref"),
    indicadorChatId,
    indicadoChatId,
    codigo,
    status: "pendente",
    criadoEm: new Date().toISOString(),
  };
  if (sqlDisponivel()) await upsertIndicacaoSql(item);
  else await gravarIndicacaoKv(kv, item);
  return { ok: true, indicacao: item };
}

export async function decidirIndicacao(
  kv: HostKvApi,
  referralId: string,
  status: "aprovada" | "rejeitada",
  operadorChatId: string,
  motivo: string,
): Promise<{
  ok: boolean;
  motivo?: string;
  indicacao?: Indicacao;
  avisoIndicador?: { chatId: string; texto: string };
  avisoIndicado?: { chatId: string; texto: string };
  subiu?: { chatId: string; de: CategoriaClube; para: CategoriaClube };
}> {
  const indicacao = sqlDisponivel() ? await lerIndicacaoSql(referralId) : await lerIndicacaoKv(kv, referralId);
  if (indicacao === undefined) return { ok: false, motivo: "nao_encontrada" };
  if (indicacao.status !== "pendente") return { ok: false, motivo: "ja_decidida", indicacao };
  let recompensa: { ok: boolean; motivo?: string; subiu?: { de: CategoriaClube; para: CategoriaClube } } = { ok: true };
  if (status === "aprovada") {
    recompensa = await creditarIndicacao(kv, indicacao);
    if (!recompensa.ok) return { ok: false, motivo: recompensa.motivo, indicacao };
  }
  const agora = new Date().toISOString();
  const atualizada: Indicacao = {
    ...indicacao,
    status,
    motivo: motivo.slice(0, 240),
    decididoEm: agora,
    decididoPor: operadorChatId,
  };
  if (sqlDisponivel()) await upsertIndicacaoSql(atualizada);
  else await gravarIndicacaoKv(kv, atualizada);
  await auditar(kv, {
    operadorChatId,
    acao: status === "aprovada" ? "indicacao_aprovada" : "indicacao_rejeitada",
    alvoChatId: indicacao.indicadoChatId,
    motivo: motivo.slice(0, 240),
    valorAnterior: "pendente",
    valorNovo: status,
  });
  if (status === "rejeitada") {
    return {
      ok: true,
      indicacao: atualizada,
      avisoIndicador: {
        chatId: indicacao.indicadorChatId,
        texto: "Uma indicação sua não foi aprovada. Os LBcoins dessa indicação não foram creditados.",
      },
    };
  }
  const quantidade = configAtual().lbcoinsIndicacao;
  return {
    ok: true,
    indicacao: atualizada,
    avisoIndicador: {
      chatId: indicacao.indicadorChatId,
      texto: `Indicação aprovada. Entraram ${quantidade} LBcoins na sua conta do Club. LBcoins não são dinheiro.`,
    },
    avisoIndicado: {
      chatId: indicacao.indicadoChatId,
      texto: "Sua indicação foi confirmada. Quem te convidou já recebeu os LBcoins dessa indicação.",
    },
    subiu:
      recompensa.subiu === undefined
        ? undefined
        : { chatId: indicacao.indicadorChatId, de: recompensa.subiu.de, para: recompensa.subiu.para },
  };
}

export async function consultarClube(kv: HostKvApi, chatId: string): Promise<ResumoClube | undefined> {
  const base = await garantirFidelidade(kv, chatId);
  if (base === undefined) return undefined;
  const lista = sqlDisponivel() ? await indicacoesDeSql(chatId) : await indicacoesDeKv(kv, chatId);
  const movimentos = sqlDisponivel() ? await historicoLbcoinsSql(chatId, 80) : await historicoLbcoinsKv(kv, chatId, 80);
  const ganhoIndicacao = movimentos
    .filter((item) => item.tipo === "indicacao" && item.quantidade > 0)
    .reduce((soma, item) => soma + item.quantidade, 0);
  const username = await usernameDoBot();
  return {
    chatId,
    codigo: base.carteira.codigoIndicacao,
    link: linkIndicacao(base.carteira.codigoIndicacao, username),
    saldo: base.carteira.saldo,
    totalRecebido: base.carteira.totalRecebido,
    totalUtilizado: base.carteira.totalUtilizado,
    xp: base.xp.xp,
    categoria: base.xp.categoria,
    categoriaEm: base.xp.categoriaEm,
    indicadas: lista.length,
    pendentes: lista.filter((item) => item.status === "pendente").length,
    aprovadas: lista.filter((item) => item.status === "aprovada").length,
    rejeitadas: lista.filter((item) => item.status === "rejeitada").length,
    ganhoIndicacao,
    recompensasBloqueadas: base.carteira.recompensasBloqueadas,
    beneficios: beneficiosDa(base.xp.categoria),
    criadoEm: base.carteira.criadoEm,
  };
}

export async function historicoRecompensas(kv: HostKvApi, chatId: string, limite = 12): Promise<MovimentoLbcoins[]> {
  const lista = sqlDisponivel() ? await historicoLbcoinsSql(chatId, 40) : await historicoLbcoinsKv(kv, chatId, 40);
  return lista
    .filter((item) => item.quantidade > 0 && (item.tipo === "recompensa" || item.tipo === "indicacao" || item.tipo === "bonus" || item.tipo === "campanha"))
    .slice(0, limite);
}

export async function historicoLbcoins(kv: HostKvApi, chatId: string, limite = 20): Promise<MovimentoLbcoins[]> {
  return sqlDisponivel() ? historicoLbcoinsSql(chatId, limite) : historicoLbcoinsKv(kv, chatId, limite);
}

export async function listarPendentes(kv: HostKvApi): Promise<Indicacao[]> {
  return sqlDisponivel() ? indicacoesPendentesSql(40) : indicacoesPendentesKv(kv, 40);
}

export async function indicacoesDe(kv: HostKvApi, chatId: string): Promise<Indicacao[]> {
  return sqlDisponivel() ? indicacoesDeSql(chatId) : indicacoesDeKv(kv, chatId);
}

export async function aplicarLbcoins(
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
): Promise<ResultadoCredito> {
  if ((await lerConta(kv, pedido.chatId)) === undefined) return { ok: false, motivo: "sem_conta" };
  await garantirFidelidade(kv, pedido.chatId);
  const TIPOS: TipoLbcoins[] = ["recompensa", "indicacao", "bonus", "campanha", "resgate", "estorno"];
  if (!TIPOS.includes(pedido.tipo)) return { ok: false, motivo: "tipo_invalido" };
  const debito = pedido.tipo === "resgate" || pedido.tipo === "estorno";
  if (debito && pedido.quantidade > 0) return { ok: false, motivo: "quantidade_invalida" };
  if (!debito && pedido.quantidade < 0) return { ok: false, motivo: "quantidade_invalida" };
  const resultado = sqlDisponivel() ? await aplicarLbcoinsSql(pedido) : await aplicarLbcoinsKv(kv, pedido);
  return resultado;
}

export async function ajustarLbcoinsAdmin(
  kv: HostKvApi,
  operadorChatId: string,
  alvoChatId: string,
  quantidade: number,
  motivo: string,
): Promise<ResultadoCredito> {
  const tipo: TipoLbcoins = quantidade < 0 ? "estorno" : "bonus";
  const resultado = await aplicarLbcoins(kv, {
    chatId: alvoChatId,
    tipo,
    quantidade,
    descricao: motivo.slice(0, 240),
    origem: "admin",
    idempotencyKey: `admin-lb:${alvoChatId}:${Date.now()}:${quantidade}`,
    admin: true,
  });
  const carteira = sqlDisponivel() ? await lerCarteiraSql(alvoChatId) : await lerCarteiraKv(kv, alvoChatId);
  await auditar(kv, {
    operadorChatId,
    acao: "ajuste_lbcoins",
    alvoChatId,
    motivo: motivo.slice(0, 240),
    valorAnterior: String((carteira?.saldo ?? 0) - (resultado.ok ? quantidade : 0)),
    valorNovo: String(carteira?.saldo ?? ""),
  });
  return resultado;
}

export async function ajustarXpAdmin(
  kv: HostKvApi,
  operadorChatId: string,
  alvoChatId: string,
  delta: number,
  motivo: string,
): Promise<{ ok: boolean; xp?: XpUsuario; subiu?: { de: CategoriaClube; para: CategoriaClube }; motivo?: string }> {
  const base = await garantirFidelidade(kv, alvoChatId);
  if (base === undefined) return { ok: false, motivo: "sem_conta" };
  const aplicado = await aplicarXp(kv, alvoChatId, delta, `Ajuste administrativo: ${motivo.slice(0, 180)}`);
  await auditar(kv, {
    operadorChatId,
    acao: "ajuste_xp",
    alvoChatId,
    motivo: motivo.slice(0, 240),
    valorAnterior: String(base.xp.xp),
    valorNovo: String(aplicado.xp.xp),
  });
  return { ok: true, xp: aplicado.xp, subiu: aplicado.subiu };
}

export async function aplicarXp(
  kv: HostKvApi,
  chatId: string,
  delta: number,
  motivo: string,
): Promise<{ xp: XpUsuario; subiu?: { de: CategoriaClube; para: CategoriaClube } }> {
  const base = await garantirFidelidade(kv, chatId);
  if (base === undefined) {
    return { xp: { chatId, xp: 0, categoria: "bronze", categoriaEm: new Date().toISOString(), versao: 1 } };
  }
  const xpNovo = Math.max(0, base.xp.xp + delta);
  const categoria = categoriaDeXp(xpNovo);
  const agora = new Date().toISOString();
  const atualizado: XpUsuario = {
    chatId,
    xp: xpNovo,
    categoria,
    categoriaEm: categoria === base.xp.categoria ? base.xp.categoriaEm : agora,
    versao: base.xp.versao + 1,
  };
  if (sqlDisponivel()) await upsertXpSql(atualizado);
  else await gravarXpKv(kv, atualizado);
  if (categoria !== base.xp.categoria) {
    await registrarHistoricoXp(kv, {
      chatId,
      xpAnterior: base.xp.xp,
      xpNovo,
      categoriaAnterior: base.xp.categoria,
      categoriaNova: categoria,
      motivo: motivo.slice(0, 240),
    });
  }
  const subiu =
    ordemCategoria(categoria) > ordemCategoria(base.xp.categoria)
      ? { de: base.xp.categoria, para: categoria }
      : undefined;
  return { xp: atualizado, subiu };
}

export async function bloquearRecompensas(
  kv: HostKvApi,
  operadorChatId: string,
  alvoChatId: string,
  bloquear: boolean,
  motivo: string,
): Promise<boolean> {
  const base = await garantirFidelidade(kv, alvoChatId);
  if (base === undefined) return false;
  const carteira = { ...base.carteira, recompensasBloqueadas: bloquear, versao: base.carteira.versao + 1 };
  if (sqlDisponivel()) await upsertCarteiraSql(carteira);
  else await gravarCarteiraKv(kv, carteira);
  await auditar(kv, {
    operadorChatId,
    acao: bloquear ? "bloquear_recompensas" : "liberar_recompensas",
    alvoChatId,
    motivo: motivo.slice(0, 240),
    valorAnterior: String(base.carteira.recompensasBloqueadas),
    valorNovo: String(bloquear),
  });
  return true;
}

export async function listarAuditoria(kv: HostKvApi, limite = 16): Promise<AuditoriaAdmin[]> {
  return sqlDisponivel() ? listarAuditoriaSql(limite) : listarAuditoriaKv(kv, limite);
}

export async function historicoCategoria(kv: HostKvApi, chatId: string): Promise<{ em: string; de: CategoriaClube; para: CategoriaClube }[]> {
  const lista = sqlDisponivel() ? await historicoXpSql(chatId, 12) : await historicoXpKv(kv, chatId, 12);
  return lista
    .filter((item) => item.categoriaAnterior !== item.categoriaNova)
    .map((item) => ({ em: item.em, de: item.categoriaAnterior, para: item.categoriaNova }));
}

async function creditarIndicacao(
  kv: HostKvApi,
  indicacao: Indicacao,
): Promise<{ ok: boolean; motivo?: string; subiu?: { de: CategoriaClube; para: CategoriaClube } }> {
  const existente = sqlDisponivel() ? await lerRewardSql(indicacao.id) : await lerRewardKv(kv, indicacao.id);
  if (existente !== undefined) return { ok: true };
  const quantidade = configAtual().lbcoinsIndicacao;
  if (quantidade <= 0) return { ok: true };
  const credito = await aplicarLbcoins(kv, {
    chatId: indicacao.indicadorChatId,
    tipo: "indicacao",
    quantidade,
    descricao: "Indicação aprovada",
    origem: `indicacao:${indicacao.id}`,
    idempotencyKey: `indicacao:${indicacao.id}`,
  });
  if (!credito.ok) return { ok: false, motivo: credito.motivo };
  const reward = {
    id: novoId("rr"),
    referralId: indicacao.id,
    chatId: indicacao.indicadorChatId,
    quantidade,
    transacaoId: credito.movimento.id,
    em: new Date().toISOString(),
  };
  if (sqlDisponivel()) await upsertRewardSql(reward);
  else await gravarRewardKv(kv, reward);
  const xp = await aplicarXp(kv, indicacao.indicadorChatId, configAtual().xpIndicacao, "Indicação aprovada");
  return { ok: true, subiu: xp.subiu === undefined ? undefined : { de: xp.subiu.de, para: xp.subiu.para } };
}

async function registrarHistoricoXp(
  kv: HostKvApi,
  item: {
    chatId: string;
    xpAnterior: number;
    xpNovo: number;
    categoriaAnterior: CategoriaClube;
    categoriaNova: CategoriaClube;
    motivo: string;
  },
): Promise<void> {
  const registro = {
    id: novoId("xph"),
    em: new Date().toISOString(),
    ...item,
  };
  if (sqlDisponivel()) await gravarHistoricoXpSql(registro);
  else await gravarHistoricoXpKv(kv, registro);
}

async function auditar(
  kv: HostKvApi,
  item: Omit<AuditoriaAdmin, "id" | "em">,
): Promise<void> {
  const registro: AuditoriaAdmin = {
    id: novoId("aud"),
    em: new Date().toISOString(),
    ...item,
  };
  if (sqlDisponivel()) await gravarAuditoriaSql(registro);
  else await gravarAuditoriaKv(kv, registro);
}

async function chatIdDoCodigo(kv: HostKvApi, codigo: string): Promise<string | undefined> {
  return sqlDisponivel() ? chatIdDoCodigoSql(codigo) : chatIdDoCodigoKv(kv, codigo);
}

async function codigoLivre(kv: HostKvApi): Promise<string> {
  for (let i = 0; i < 12; i += 1) {
    const codigo = novoCodigoIndicacao();
    const dono = await chatIdDoCodigo(kv, codigo);
    if (dono === undefined) return codigo;
  }
  return novoCodigoIndicacao();
}

function ordemCategoria(categoria: CategoriaClube): number {
  if (categoria === "ouro") return 2;
  if (categoria === "prata") return 1;
  return 0;
}

export function payloadStart(texto: string): string | undefined {
  const m = texto.trim().match(/^\/start(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/i);
  const payload = m?.[1];
  return payload !== undefined && payload.length > 0 ? payload : undefined;
}

export function criterioRotulo(criterio: CriterioIndicacao): string {
  return criterio === "conta_aberta" ? "conta aberta neste chat" : "aprovação da gerência";
}
