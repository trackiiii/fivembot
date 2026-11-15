import { timingSafeEqual } from "node:crypto";

import type { HostKvApi } from "@grok/agent-sdk";

import { bloquearConta, confirmarCobrancaSandbox, painelCarteira, reaisDe } from "../banco.js";
import { configAtual, garantirConfig, gravarConfig, unirChatsAdmin } from "../config.js";
import { gatewayConfigurada } from "../gateway.js";
import { ehAdmin, emSandbox, modoCarteira } from "../modo.js";
import { pspAtual } from "../psp.js";

export const CHAVE_UI = (chatId: string) => `linhabank:admin:ui:${chatId}`;
export const CHAVE_PENDENTE = (chatId: string) => `linhabank:admin:pendente:${chatId}`;

export type AbaAdmin = "visao" | "contas" | "pix" | "ledger" | "config" | "liveok";
export type CampoPendente =
  | "nomeExibido"
  | "chaveRecebimento"
  | "cidadeRecebimento"
  | "taxaCentavos"
  | "taxaPercentual"
  | "limiteCentavos"
  | "webappUrl"
  | "chatsAdmin";

export type BotaoAdmin = { text: string; callback_data: string };

export type TelaAdmin = {
  texto: string;
  teclado: BotaoAdmin[][];
  aviso?: string;
};

export type ResultadoAdmin = {
  tela: TelaAdmin;
  aviso?: string;
  atualizarPerfil?: boolean;
  avisoCliente?: { chatId: string; texto: string };
};

export type UiAdmin = {
  aba: AbaAdmin;
  pagina: number;
  mensagemId?: number;
};

const PAGE = 4;

const CAMPOS: Record<string, CampoPendente> = {
  n: "nomeExibido",
  h: "chaveRecebimento",
  i: "cidadeRecebimento",
  f: "taxaCentavos",
  e: "taxaPercentual",
  u: "limiteCentavos",
  w: "webappUrl",
  s: "chatsAdmin",
};

const ROTULO_CAMPO: Record<CampoPendente, string> = {
  nomeExibido: "nome exibido",
  chaveRecebimento: "chave PIX de recebimento",
  cidadeRecebimento: "cidade do BR Code",
  taxaCentavos: "taxa fixa em centavos",
  taxaPercentual: "taxa percentual",
  limiteCentavos: "limite por operação em centavos",
  webappUrl: "URL HTTPS do mini-app (opcional)",
  chatsAdmin: "IDs dos chats admin, separados por vírgula",
};

const DICA_CAMPO: Record<CampoPendente, string> = {
  nomeExibido: "2 a 32 caracteres.",
  chaveRecebimento: "E-mail, CPF, CNPJ, telefone ou chave aleatória.",
  cidadeRecebimento: "Até 15 letras, sem acento.",
  taxaCentavos: "Ex.: 99 = R$ 0,99. PIX entre contas LinhaBank continua sem taxa.",
  taxaPercentual: "Ex.: 1,50. Zero se vazio.",
  limiteCentavos: "Ex.: 250000 = R$ 2.500,00.",
  webappUrl: "Deixe vazio. Só use se houver HTTPS. O painel não precisa disso.",
  chatsAdmin: "Só números. O seu chat entra sozinho se ainda não estiver.",
};

export function lerComandoAdmin(texto: string): { token?: string } | undefined {
  const m = texto.trim().match(/^\/admin(?:@[A-Za-z0-9_]+)?(?:\s+(\S+))?\s*$/i);
  if (m === null) return undefined;
  return { token: m[1] };
}

export async function tentarAbrirAdmin(
  kv: HostKvApi,
  chatId: string,
  token?: string,
): Promise<"ok" | "pedir_token" | "negado"> {
  await garantirConfig(kv);
  if (ehAdmin(chatId)) return "ok";
  const esperado = (process.env.ADMIN_TOKEN ?? "").trim();
  if (esperado.length < 8) return "negado";
  if (token === undefined || token.length === 0) return "pedir_token";
  if (!tokenConfere(token, esperado)) return "negado";
  const atual = configAtual();
  await gravarConfig(kv, { chatsAdmin: unirChatsAdmin(atual.chatsAdmin, chatId) });
  return "ok";
}

export async function lerUi(kv: HostKvApi, chatId: string): Promise<UiAdmin> {
  const bruto = await kv.get(CHAVE_UI(chatId));
  if (bruto === null || bruto === undefined || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { aba: "visao", pagina: 0 };
  }
  const aba = bruto.aba;
  const pagina = bruto.pagina;
  const mensagemId = bruto.mensagemId;
  return {
    aba:
      aba === "contas" || aba === "pix" || aba === "ledger" || aba === "config" || aba === "liveok"
        ? aba
        : "visao",
    pagina: typeof pagina === "number" && Number.isSafeInteger(pagina) && pagina >= 0 ? pagina : 0,
    mensagemId:
      typeof mensagemId === "number" && Number.isSafeInteger(mensagemId) && mensagemId > 0
        ? mensagemId
        : undefined,
  };
}

export async function gravarUi(kv: HostKvApi, chatId: string, ui: UiAdmin): Promise<void> {
  await kv.put(CHAVE_UI(chatId), {
    aba: ui.aba,
    pagina: ui.pagina,
    ...(ui.mensagemId !== undefined ? { mensagemId: ui.mensagemId } : {}),
  });
}

export async function abrirTelaInicial(kv: HostKvApi, chatId: string): Promise<TelaAdmin> {
  await kv.delete(CHAVE_PENDENTE(chatId));
  const ui = await lerUi(kv, chatId);
  await gravarUi(kv, chatId, { ...ui, aba: "visao", pagina: 0 });
  return montarTela(kv, chatId);
}

export async function montarTela(kv: HostKvApi, chatId: string): Promise<TelaAdmin> {
  const pendente = await lerPendente(kv, chatId);
  if (pendente !== undefined) return telaPendente(pendente);
  const ui = await lerUi(kv, chatId);
  const config = await garantirConfig(kv);
  const painel = await painelCarteira(kv);
  if (ui.aba === "liveok") return telaLiveOk();
  if (ui.aba === "contas") return telaContas(painel, ui.pagina);
  if (ui.aba === "pix") return telaPix(painel, ui.pagina, config.modo);
  if (ui.aba === "ledger") return telaLedger(painel, ui.pagina);
  if (ui.aba === "config") return telaConfig(config);
  return telaVisao(painel, config);
}

export async function aplicarAcao(kv: HostKvApi, chatId: string, dados: string): Promise<ResultadoAdmin> {
  await garantirConfig(kv);
  const acao = parseAcao(dados);
  if (acao === undefined) {
    return { tela: await montarTela(kv, chatId), aviso: "Botão inválido." };
  }
  if (acao.tipo === "cancelar") {
    await kv.delete(CHAVE_PENDENTE(chatId));
    const ui = await lerUi(kv, chatId);
    await gravarUi(kv, chatId, { ...ui, aba: ui.aba === "liveok" ? "visao" : ui.aba });
    return { tela: await montarTela(kv, chatId), aviso: "Cancelado." };
  }
  if (acao.tipo === "aba") {
    await kv.delete(CHAVE_PENDENTE(chatId));
    await gravarUi(kv, chatId, { aba: acao.aba, pagina: acao.pagina ?? 0 });
    return { tela: await montarTela(kv, chatId) };
  }
  if (acao.tipo === "atualizar") {
    return { tela: await montarTela(kv, chatId), aviso: "Atualizado." };
  }
  if (acao.tipo === "modo") {
    if (acao.modo === "sandbox") {
      await gravarConfig(kv, { modo: "sandbox" });
      await gravarUi(kv, chatId, { aba: "visao", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Modo sandbox.", atualizarPerfil: true };
    }
    if (acao.modo === "live?") {
      await gravarUi(kv, chatId, { aba: "liveok", pagina: 0 });
      return { tela: await montarTela(kv, chatId) };
    }
    await gravarConfig(kv, { modo: "live" });
    await gravarUi(kv, chatId, { aba: "visao", pagina: 0 });
    return {
      tela: await montarTela(kv, chatId),
      aviso: "Modo live. Gateway e regulação continuam por sua conta.",
      atualizarPerfil: true,
    };
  }
  if (acao.tipo === "pedir") {
    await kv.put(CHAVE_PENDENTE(chatId), acao.campo);
    return { tela: telaPendente(acao.campo) };
  }
  if (acao.tipo === "toggle") {
    const atual = configAtual();
    await gravarConfig(kv, { [acao.campo]: !atual[acao.campo] });
    await gravarUi(kv, chatId, { aba: "config", pagina: 0 });
    return { tela: await montarTela(kv, chatId), aviso: "Configuração atualizada.", atualizarPerfil: true };
  }
  if (acao.tipo === "bloquear") {
    const painel = await painelCarteira(kv);
    const conta = painel.contas[acao.indice];
    if (conta === undefined) return { tela: await montarTela(kv, chatId), aviso: "Conta não encontrada." };
    const bloquear = conta.status !== "bloqueada";
    await bloquearConta(kv, conta.chatId, bloquear);
    await gravarUi(kv, chatId, { aba: "contas", pagina: Math.floor(acao.indice / PAGE) });
    return {
      tela: await montarTela(kv, chatId),
      aviso: bloquear ? `Conta ${conta.numero} bloqueada.` : `Conta ${conta.numero} liberada.`,
    };
  }
  const painel = await painelCarteira(kv);
  const cobranca = painel.cobrancas[acao.indice];
  if (cobranca === undefined) return { tela: await montarTela(kv, chatId), aviso: "Cobrança não encontrada." };
  if (!emSandbox()) return { tela: await montarTela(kv, chatId), aviso: "Confirmar PIX só existe em sandbox." };
  const resultado = await confirmarCobrancaSandbox(kv, cobranca.id);
  await gravarUi(kv, chatId, { aba: "pix", pagina: Math.floor(acao.indice / PAGE) });
  if (resultado.estado === "novo") {
    return {
      tela: await montarTela(kv, chatId),
      aviso: "PIX confirmado.",
      avisoCliente: { chatId: resultado.chatId, texto: resultado.texto },
    };
  }
  return { tela: await montarTela(kv, chatId), aviso: `Não confirmou (${resultado.estado}).` };
}

export async function aplicarTextoAdmin(
  kv: HostKvApi,
  chatId: string,
  texto: string,
): Promise<ResultadoAdmin | undefined> {
  const campo = await lerPendente(kv, chatId);
  if (campo === undefined) return undefined;
  await garantirConfig(kv);
  const pedido = pedidoDoTexto(campo, texto, chatId);
  if (pedido === undefined) {
    return { tela: { ...telaPendente(campo), aviso: "Valor inválido. Digite de novo." } };
  }
  await gravarConfig(kv, pedido);
  await kv.delete(CHAVE_PENDENTE(chatId));
  await gravarUi(kv, chatId, { aba: "config", pagina: 0 });
  return {
    tela: await montarTela(kv, chatId),
    aviso: "Configuração salva.",
    atualizarPerfil: campo === "nomeExibido" || campo === "webappUrl" || campo === "chatsAdmin",
  };
}

export function parseAcao(dados: string):
  | { tipo: "aba"; aba: AbaAdmin; pagina?: number }
  | { tipo: "modo"; modo: "sandbox" | "live" | "live?" }
  | { tipo: "bloquear"; indice: number }
  | { tipo: "pagar"; indice: number }
  | { tipo: "pedir"; campo: CampoPendente }
  | { tipo: "toggle"; campo: "prefixoThialinha" | "botaoMiniApp" }
  | { tipo: "cancelar" }
  | { tipo: "atualizar" }
  | undefined {
  if (dados === "a:v") return { tipo: "aba", aba: "visao" };
  if (dados === "a:g") return { tipo: "aba", aba: "config" };
  if (dados === "a:ms") return { tipo: "modo", modo: "sandbox" };
  if (dados === "a:ml") return { tipo: "modo", modo: "live?" };
  if (dados === "a:my") return { tipo: "modo", modo: "live" };
  if (dados === "a:z") return { tipo: "cancelar" };
  if (dados === "a:r") return { tipo: "atualizar" };
  if (dados === "a:t:p") return { tipo: "toggle", campo: "prefixoThialinha" };
  if (dados === "a:t:b") return { tipo: "toggle", campo: "botaoMiniApp" };
  const aba = dados.match(/^a:([cpl]):(\d+)$/) ?? dados.match(/^a:([cpl])$/);
  if (aba !== null) {
    const letra = aba[1];
    const pagina = aba[2] !== undefined ? Number(aba[2]) : 0;
    if (!Number.isSafeInteger(pagina) || pagina < 0 || pagina > 200) return undefined;
    const nome = letra === "c" ? "contas" : letra === "p" ? "pix" : "ledger";
    return { tipo: "aba", aba: nome, pagina };
  }
  const pedir = dados.match(/^a:k:([nhifeuws])$/);
  if (pedir !== null) {
    const campo = CAMPOS[pedir[1]];
    if (campo === undefined) return undefined;
    return { tipo: "pedir", campo };
  }
  const item = dados.match(/^a:([bx]):(\d+)$/);
  if (item === null) return undefined;
  const indice = Number(item[2]);
  if (!Number.isSafeInteger(indice) || indice < 0 || indice > 10_000) return undefined;
  return item[1] === "b" ? { tipo: "bloquear", indice } : { tipo: "pagar", indice };
}

function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function lerPendente(kv: HostKvApi, chatId: string): Promise<CampoPendente | undefined> {
  const valor = await kv.get(CHAVE_PENDENTE(chatId));
  if (typeof valor !== "string") return undefined;
  return (Object.values(CAMPOS) as string[]).includes(valor) ? (valor as CampoPendente) : undefined;
}

function pedidoDoTexto(campo: CampoPendente, texto: string, chatId: string): Record<string, unknown> | undefined {
  const limpo = texto.trim();
  if (limpo.length === 0) return undefined;
  if (campo === "taxaCentavos" || campo === "limiteCentavos") {
    const n = Number(limpo.replace(/\D/g, ""));
    if (!Number.isSafeInteger(n)) return undefined;
    return { [campo]: n };
  }
  if (campo === "nomeExibido" && limpo.length < 2) return undefined;
  if (campo === "cidadeRecebimento" && limpo.length < 2) return undefined;
  if (campo === "webappUrl" && limpo.length > 0 && !/^https:\/\//i.test(limpo)) return undefined;
  if (campo === "chatsAdmin") {
    const ids = limpo
      .split(",")
      .map((item) => item.trim())
      .filter((item) => /^\d{1,16}$/.test(item));
    if (!ids.includes(chatId)) ids.push(chatId);
    return { chatsAdmin: unirChatsAdmin(ids.join(","), chatId) };
  }
  return { [campo]: limpo };
}

function nav(aba: AbaAdmin): BotaoAdmin[][] {
  const marca = (id: AbaAdmin, rotulo: string, dados: string): BotaoAdmin => ({
    text: aba === id ? `• ${rotulo}` : rotulo,
    callback_data: dados,
  });
  return [
    [marca("visao", "Visão", "a:v"), marca("contas", "Contas", "a:c"), marca("pix", "PIX", "a:p")],
    [marca("ledger", "Ledger", "a:l"), marca("config", "Config", "a:g"), { text: "Atualizar", callback_data: "a:r" }],
  ];
}

function telaVisao(
  painel: Awaited<ReturnType<typeof painelCarteira>>,
  config: ReturnType<typeof configAtual>,
): TelaAdmin {
  const texto = [
    "LINHABANK · Administração",
    "Painel com botões, neste chat. Sem a Thialinha.",
    "",
    `Modo: ${config.modo}`,
    `Saldo agregado: R$ ${reaisDe(painel.totalCentavos)}`,
    `Contas: ${painel.contas.length} · Persistência: ${painel.sql ? "SQL" : "KV"}`,
    `Gateway: ${gatewayConfigurada() ? "configurada" : "não"} · PSP: ${pspAtual().nome}`,
    `Admins: ${config.chatsAdmin.length > 0 ? config.chatsAdmin : "nenhum"}`,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("visao"),
      [
        { text: config.modo === "sandbox" ? "• Sandbox" : "Sandbox", callback_data: "a:ms" },
        { text: config.modo === "live" ? "• Live" : "Live", callback_data: "a:ml" },
      ],
    ],
  };
}

function telaLiveOk(): TelaAdmin {
  return {
    texto: [
      "Confirmar modo live?",
      "Isso não liga um PSP de produção sozinho. Gateway, segurança e regulação continuam por fora.",
    ].join("\n"),
    teclado: [
      [
        { text: "Confirmar live", callback_data: "a:my" },
        { text: "Cancelar", callback_data: "a:z" },
      ],
    ],
  };
}

function telaContas(painel: Awaited<ReturnType<typeof painelCarteira>>, pagina: number): TelaAdmin {
  const fatia = paginar(painel.contas, pagina);
  const linhas =
    fatia.itens.length === 0
      ? ["Nenhuma conta."]
      : fatia.itens.map((conta, i) => {
          const indice = fatia.inicio + i;
          return `${indice + 1}. ${conta.numero} · ${conta.nome} · R$ ${conta.saldo} · ${conta.status}`;
        });
  const acoes: BotaoAdmin[][] = fatia.itens.map((conta, i) => [
    {
      text: conta.status === "bloqueada" ? `Liberar ${conta.numero}` : `Bloquear ${conta.numero}`,
      callback_data: `a:b:${fatia.inicio + i}`,
    },
  ]);
  return {
    texto: ["Contas", ...linhas, fatia.rodape].filter((item) => item.length > 0).join("\n"),
    teclado: [...nav("contas"), ...acoes, ...fatia.teclado("c")],
  };
}

function telaPix(
  painel: Awaited<ReturnType<typeof painelCarteira>>,
  pagina: number,
  modo: string,
): TelaAdmin {
  const fatia = paginar(painel.cobrancas, pagina);
  const linhas =
    fatia.itens.length === 0
      ? ["Nenhuma cobrança."]
      : fatia.itens.map((item, i) => `${fatia.inicio + i + 1}. ${item.id} · R$ ${item.valor} · ${item.status}`);
  const acoes: BotaoAdmin[][] = [];
  if (modo === "sandbox") {
    for (let i = 0; i < fatia.itens.length; i += 1) {
      const item = fatia.itens[i];
      if (item.status !== "aberta") continue;
      acoes.push([{ text: `Confirmar PIX R$ ${item.valor}`, callback_data: `a:x:${fatia.inicio + i}` }]);
    }
  }
  return {
    texto: ["PIX / cobranças", ...linhas, fatia.rodape].filter((item) => item.length > 0).join("\n"),
    teclado: [...nav("pix"), ...acoes, ...fatia.teclado("p")],
  };
}

function telaLedger(painel: Awaited<ReturnType<typeof painelCarteira>>, pagina: number): TelaAdmin {
  const fatia = paginar(painel.ledger, pagina);
  const linhas =
    fatia.itens.length === 0
      ? ["Sem lançamentos."]
      : fatia.itens.map(
          (item) => `${item.em} · ${item.tipo} · R$ ${item.valor} · ${item.conta} · ${item.comprovante ?? "—"}`,
        );
  return {
    texto: ["Ledger", ...linhas, fatia.rodape].filter((item) => item.length > 0).join("\n"),
    teclado: [...nav("ledger"), ...fatia.teclado("l")],
  };
}

function telaConfig(config: ReturnType<typeof configAtual>): TelaAdmin {
  const texto = [
    "Configuração",
    `Nome: ${config.nomeExibido}`,
    `Chave PIX: ${config.chaveRecebimento || "—"}`,
    `Cidade: ${config.cidadeRecebimento}`,
    `Taxa externa: ${config.taxaCentavos} centavos + ${config.taxaPercentual}%`,
    `Limite: ${config.limiteCentavos} centavos`,
    `Prefixo Thialinha: ${config.prefixoThialinha ? "ligado" : "desligado"}`,
    `Botão mini-app: ${config.botaoMiniApp ? "ligado" : "desligado"}`,
    `URL mini-app: ${config.webappUrl || "—"}`,
    `Admins: ${config.chatsAdmin || "—"}`,
    "",
    "PIX entre contas LinhaBank permanece sem taxa.",
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("config"),
      [
        { text: "Nome", callback_data: "a:k:n" },
        { text: "Chave PIX", callback_data: "a:k:h" },
        { text: "Cidade", callback_data: "a:k:i" },
      ],
      [
        { text: "Taxa R$", callback_data: "a:k:f" },
        { text: "Taxa %", callback_data: "a:k:e" },
        { text: "Limite", callback_data: "a:k:u" },
      ],
      [
        { text: config.prefixoThialinha ? "Prefixo: on" : "Prefixo: off", callback_data: "a:t:p" },
        { text: config.botaoMiniApp ? "Mini-app: on" : "Mini-app: off", callback_data: "a:t:b" },
      ],
      [
        { text: "Admins", callback_data: "a:k:s" },
        { text: "URL mini-app", callback_data: "a:k:w" },
      ],
    ],
  };
}

function telaPendente(campo: CampoPendente): TelaAdmin {
  const atual = configAtual();
  const valor = String(atual[campo] ?? "");
  return {
    texto: [
      `Alterar ${ROTULO_CAMPO[campo]}`,
      `Atual: ${valor.length > 0 ? valor : "—"}`,
      DICA_CAMPO[campo],
      "Digite o novo valor neste chat.",
    ].join("\n"),
    teclado: [[{ text: "Cancelar", callback_data: "a:z" }]],
  };
}

function paginar<T>(itens: T[], pagina: number): {
  itens: T[];
  inicio: number;
  rodape: string;
  teclado: (letra: "c" | "p" | "l") => BotaoAdmin[][];
} {
  const max = Math.max(0, Math.ceil(itens.length / PAGE) - 1);
  const p = Math.min(Math.max(0, pagina), max);
  const inicio = p * PAGE;
  const fatia = itens.slice(inicio, inicio + PAGE);
  const rodape = itens.length > PAGE ? `Página ${p + 1} de ${max + 1}` : "";
  return {
    itens: fatia,
    inicio,
    rodape,
    teclado: (letra) => {
      if (itens.length <= PAGE) return [];
      const row: BotaoAdmin[] = [];
      if (p > 0) row.push({ text: "◀", callback_data: `a:${letra}:${p - 1}` });
      if (p < max) row.push({ text: "▶", callback_data: `a:${letra}:${p + 1}` });
      return row.length > 0 ? [row] : [];
    },
  };
}
