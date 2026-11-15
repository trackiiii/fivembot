import { timingSafeEqual } from "node:crypto";

import type { HostKvApi } from "@grok/agent-sdk";

import { contarAgendamentosAtivos } from "../agenda.js";
import {
  bloquearCartaoGerencia,
  bloquearConta,
  cancelarCobrancaAberta,
  confirmarCobrancaSandbox,
  operarConta,
  painelCarteira,
  reaisDe,
  type ContaPainel,
} from "../banco.js";
import { idCanalValido } from "../canal.js";
import { configAtual, garantirConfig, gravarConfig, unirChatsAdmin } from "../config.js";
import { consultarTaxasGateway, rotuloLiquidacao, type TaxasPsp } from "../psp.js";
import { dataHoraBrasil, formatarQuando } from "../horario.js";
import { ehAdmin, emSandbox } from "../modo.js";
import { detalheTaxaPixExterno, taxaPixExternoCentavos } from "../taxa.js";

export const CHAVE_UI = (chatId: string) => `linhabank:admin:ui:${chatId}`;
export const CHAVE_PENDENTE = (chatId: string) => `linhabank:admin:pendente:${chatId}`;
export const CHAVE_TAXAS_GATEWAY = "linhabank:taxas-gateway";

export type AbaAdmin = "visao" | "contas" | "pix" | "ledger" | "config" | "liveok" | "ficha" | "extrato";
export type CampoPendente =
  | "nomeExibido"
  | "chaveRecebimento"
  | "cidadeRecebimento"
  | "taxaCentavos"
  | "taxaPercentual"
  | "limiteCentavos"
  | "webappUrl"
  | "chatsAdmin"
  | "canalMovimento"
  | "busca";

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
  indice?: number;
  mensagemId?: number;
};

const PAGE = 4;

const CAMPOS: Record<string, Exclude<CampoPendente, "busca">> = {
  n: "nomeExibido",
  h: "chaveRecebimento",
  i: "cidadeRecebimento",
  f: "taxaCentavos",
  e: "taxaPercentual",
  u: "limiteCentavos",
  w: "webappUrl",
  s: "chatsAdmin",
  m: "canalMovimento",
};

const ROTULO_CAMPO: Record<Exclude<CampoPendente, "busca">, string> = {
  nomeExibido: "nome da instituição",
  chaveRecebimento: "chave PIX de recebimento",
  cidadeRecebimento: "praça da cobrança",
  taxaCentavos: "adicional LinhaBank sobre a gateway, em centavos",
  taxaPercentual: "adicional LinhaBank sobre a gateway, em percentual",
  limiteCentavos: "limite por operação, em centavos",
  webappUrl: "endereço HTTPS do canal digital",
  chatsAdmin: "identificadores dos operadores, separados por vírgula",
  canalMovimento: "identificador do canal de movimento no Telegram",
};

const DICA_CAMPO: Record<Exclude<CampoPendente, "busca">, string> = {
  nomeExibido: "2 a 32 caracteres.",
  chaveRecebimento: "E-mail, CPF, CNPJ, telefone ou chave aleatória.",
  cidadeRecebimento: "Até 15 letras, sem acento.",
  taxaCentavos: "Ex.: 99 = R$ 0,99 a somar ao custo da gateway. PIX interno permanece isento.",
  taxaPercentual: "Ex.: 1,50. Soma-se ao custo da gateway no PIX externo. Informe 0 para isentar o adicional percentual.",
  limiteCentavos: "Ex.: 250000 = R$ 2.500,00.",
  webappUrl: "Opcional. Somente HTTPS.",
  chatsAdmin: "Somente números. O operador atual permanece na lista.",
  canalMovimento: "Chat id do canal (ex.: -1001234567890) ou @usuario. Envie - para voltar aos operadores.",
};

const ROTULO_MOVIMENTO: Record<string, string> = {
  pix_enviado: "PIX enviado",
  pix_recebido: "PIX recebido",
  deposito: "Depósito",
  boleto: "Boleto",
  transferencia_enviada: "Transferência enviada",
  transferencia_recebida: "Transferência recebida",
  taxa: "Tarifa",
  estorno: "Estorno",
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
  const indice = bruto.indice;
  const mensagemId = bruto.mensagemId;
  return {
    aba: abaValida(aba) ? aba : "visao",
    pagina: inteiro(pagina, 0),
    indice: typeof indice === "number" && Number.isSafeInteger(indice) && indice >= 0 ? indice : undefined,
    mensagemId: typeof mensagemId === "number" && Number.isSafeInteger(mensagemId) && mensagemId > 0 ? mensagemId : undefined,
  };
}

export async function gravarUi(kv: HostKvApi, chatId: string, ui: UiAdmin): Promise<void> {
  await kv.put(CHAVE_UI(chatId), {
    aba: ui.aba,
    pagina: ui.pagina,
    ...(ui.indice !== undefined ? { indice: ui.indice } : {}),
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
  if (ui.aba === "liveok") return telaProducao();
  if (ui.aba === "contas") return telaContas(painel, ui.pagina);
  if (ui.aba === "pix") return telaPix(painel, ui.pagina, config.modo, await contarAgendamentosAtivos(kv));
  if (ui.aba === "ledger") return telaMovimento(painel, ui.pagina);
  if (ui.aba === "config") return telaParametros(config, await lerTaxasGateway(kv));
  if (ui.aba === "ficha") return telaFicha(painel, ui.indice ?? 0);
  if (ui.aba === "extrato") return telaExtrato(kv, painel, ui.indice ?? 0);
  return telaResumo(painel, config, await contarAgendamentosAtivos(kv));
}

export async function aplicarAcao(kv: HostKvApi, chatId: string, dados: string): Promise<ResultadoAdmin> {
  await garantirConfig(kv);
  const acao = parseAcao(dados);
  if (acao === undefined) return { tela: await montarTela(kv, chatId), aviso: "Operação inválida." };
  if (acao.tipo === "cancelar") {
    await kv.delete(CHAVE_PENDENTE(chatId));
    const ui = await lerUi(kv, chatId);
    await gravarUi(kv, chatId, { ...ui, aba: ui.aba === "liveok" ? "visao" : ui.aba === "ficha" || ui.aba === "extrato" ? "contas" : ui.aba });
    return { tela: await montarTela(kv, chatId), aviso: "Operação cancelada." };
  }
  if (acao.tipo === "aba") {
    await kv.delete(CHAVE_PENDENTE(chatId));
    const ui = await lerUi(kv, chatId);
    await gravarUi(kv, chatId, { ...ui, aba: acao.aba, pagina: acao.pagina ?? 0, indice: acao.indice ?? ui.indice });
    return { tela: await montarTela(kv, chatId) };
  }
  if (acao.tipo === "atualizar") {
    const aviso = await sincronizarTaxasGateway(kv);
    return { tela: await montarTela(kv, chatId), aviso };
  }
  if (acao.tipo === "modo") {
    if (acao.modo === "sandbox") {
      await gravarConfig(kv, { modo: "sandbox" });
      await gravarUi(kv, chatId, { aba: "visao", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Ambiente: homologação.", atualizarPerfil: true };
    }
    if (acao.modo === "live?") {
      await gravarUi(kv, chatId, { aba: "liveok", pagina: 0 });
      return { tela: await montarTela(kv, chatId) };
    }
    await gravarConfig(kv, { modo: "live" });
    await gravarUi(kv, chatId, { aba: "visao", pagina: 0 });
    return {
      tela: await montarTela(kv, chatId),
      aviso: "Ambiente: produção. A liquidação depende do convênio contratado.",
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
    return { tela: await montarTela(kv, chatId), aviso: "Parametrização atualizada.", atualizarPerfil: true };
  }
  if (acao.tipo === "bloquear") {
    const painel = await painelCarteira(kv);
    const conta = painel.contas[acao.indice];
    if (conta === undefined) return { tela: await montarTela(kv, chatId), aviso: "Conta não localizada." };
    const bloquear = conta.status !== "bloqueada";
    await bloquearConta(kv, conta.chatId, bloquear);
    await gravarUi(kv, chatId, { aba: "ficha", pagina: 0, indice: acao.indice });
    return {
      tela: await montarTela(kv, chatId),
      aviso: bloquear ? `Conta ${conta.numero} bloqueada.` : `Conta ${conta.numero} desbloqueada.`,
    };
  }
  if (acao.tipo === "cartao") {
    const painel = await painelCarteira(kv);
    const conta = painel.contas[acao.indice];
    if (conta === undefined) return { tela: await montarTela(kv, chatId), aviso: "Conta não localizada." };
    await bloquearCartaoGerencia(kv, conta.chatId, !conta.cartaoBloqueado);
    await gravarUi(kv, chatId, { aba: "ficha", pagina: 0, indice: acao.indice });
    return {
      tela: await montarTela(kv, chatId),
      aviso: conta.cartaoBloqueado ? `Cartão ${conta.numero} liberado.` : `Cartão ${conta.numero} bloqueado.`,
    };
  }
  if (acao.tipo === "cancelar_pix") {
    const painel = await painelCarteira(kv);
    const cobranca = painel.cobrancas[acao.indice];
    if (cobranca === undefined) return { tela: await montarTela(kv, chatId), aviso: "Cobrança não localizada." };
    const cancelada = await cancelarCobrancaAberta(kv, cobranca.id);
    await gravarUi(kv, chatId, { aba: "pix", pagina: Math.floor(acao.indice / PAGE) });
    return {
      tela: await montarTela(kv, chatId),
      aviso: cancelada === undefined ? "Cobrança não estava em aberto." : "Cobrança cancelada.",
    };
  }
  const painel = await painelCarteira(kv);
  const cobranca = painel.cobrancas[acao.indice];
  if (cobranca === undefined) return { tela: await montarTela(kv, chatId), aviso: "Cobrança não localizada." };
  if (!emSandbox()) return { tela: await montarTela(kv, chatId), aviso: "A liquidação manual só existe em homologação." };
  const resultado = await confirmarCobrancaSandbox(kv, cobranca.id);
  await gravarUi(kv, chatId, { aba: "pix", pagina: Math.floor(acao.indice / PAGE) });
  if (resultado.estado === "novo") {
    return {
      tela: await montarTela(kv, chatId),
      aviso: "Liquidação registrada.",
      avisoCliente: { chatId: resultado.chatId, texto: resultado.texto },
    };
  }
  return { tela: await montarTela(kv, chatId), aviso: `Liquidação não efetivada (${rotuloEstado(resultado.estado)}).` };
}

export async function aplicarTextoAdmin(
  kv: HostKvApi,
  chatId: string,
  texto: string,
): Promise<ResultadoAdmin | undefined> {
  const campo = await lerPendente(kv, chatId);
  if (campo === undefined) return undefined;
  await garantirConfig(kv);
  if (campo === "busca") {
    const painel = await painelCarteira(kv);
    const achadas = filtrarContas(painel.contas, texto);
    await kv.delete(CHAVE_PENDENTE(chatId));
    if (achadas.length === 0) {
      await gravarUi(kv, chatId, { aba: "contas", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Nenhuma conta encontrada." };
    }
    const indice = painel.contas.findIndex((item) => item.chatId === achadas[0].chatId);
    await gravarUi(kv, chatId, { aba: achadas.length === 1 ? "ficha" : "contas", pagina: 0, indice });
    return {
      tela: achadas.length === 1 ? telaFicha(painel, indice) : telaContasFiltradas(painel, achadas),
      aviso: achadas.length === 1 ? `Conta ${achadas[0].numero}.` : `${achadas.length} contas encontradas.`,
    };
  }
  const pedido = pedidoDoTexto(campo, texto, chatId);
  if (pedido === undefined) {
    return { tela: { ...telaPendente(campo), aviso: "Valor inválido. Informe novamente." } };
  }
  await gravarConfig(kv, pedido);
  await kv.delete(CHAVE_PENDENTE(chatId));
  await gravarUi(kv, chatId, { aba: "config", pagina: 0 });
  return {
    tela: await montarTela(kv, chatId),
    aviso: "Parametrização gravada.",
    atualizarPerfil: campo === "nomeExibido" || campo === "webappUrl" || campo === "chatsAdmin",
  };
}

export function parseAcao(dados: string):
  | { tipo: "aba"; aba: AbaAdmin; pagina?: number; indice?: number }
  | { tipo: "modo"; modo: "sandbox" | "live" | "live?" }
  | { tipo: "bloquear"; indice: number }
  | { tipo: "pagar"; indice: number }
  | { tipo: "cancelar_pix"; indice: number }
  | { tipo: "cartao"; indice: number }
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
  if (dados === "a:q") return { tipo: "pedir", campo: "busca" };
  const aba = dados.match(/^a:([cpl]):(\d+)$/) ?? dados.match(/^a:([cpl])$/);
  if (aba !== null) {
    const letra = aba[1];
    const pagina = aba[2] !== undefined ? Number(aba[2]) : 0;
    if (!Number.isSafeInteger(pagina) || pagina < 0 || pagina > 200) return undefined;
    const nome = letra === "c" ? "contas" : letra === "p" ? "pix" : "ledger";
    return { tipo: "aba", aba: nome, pagina };
  }
  const pedir = dados.match(/^a:k:([nhifeuwsm])$/);
  if (pedir !== null) {
    const campo = CAMPOS[pedir[1]];
    if (campo === undefined) return undefined;
    return { tipo: "pedir", campo };
  }
  const item = dados.match(/^a:([bxdejy]):(\d+)$/);
  if (item === null) return undefined;
  const indice = Number(item[2]);
  if (!Number.isSafeInteger(indice) || indice < 0 || indice > 10_000) return undefined;
  if (item[1] === "b") return { tipo: "bloquear", indice };
  if (item[1] === "x") return { tipo: "pagar", indice };
  if (item[1] === "y") return { tipo: "cancelar_pix", indice };
  if (item[1] === "j") return { tipo: "cartao", indice };
  if (item[1] === "d") return { tipo: "aba", aba: "ficha", indice };
  return { tipo: "aba", aba: "extrato", indice };
}

function abaValida(valor: unknown): valor is AbaAdmin {
  return (
    valor === "visao" ||
    valor === "contas" ||
    valor === "pix" ||
    valor === "ledger" ||
    valor === "config" ||
    valor === "liveok" ||
    valor === "ficha" ||
    valor === "extrato"
  );
}

function inteiro(valor: unknown, padrao: number): number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0 ? valor : padrao;
}

function tokenConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function lerPendente(kv: HostKvApi, chatId: string): Promise<CampoPendente | undefined> {
  const valor = await kv.get(CHAVE_PENDENTE(chatId));
  if (valor === "busca") return "busca";
  if (typeof valor !== "string") return undefined;
  return (Object.values(CAMPOS) as string[]).includes(valor) ? (valor as Exclude<CampoPendente, "busca">) : undefined;
}

function pedidoDoTexto(campo: Exclude<CampoPendente, "busca">, texto: string, chatId: string): Record<string, unknown> | undefined {
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
  if (campo === "canalMovimento") {
    if (limpo === "-" || limpo.toLowerCase() === "nao" || limpo.toLowerCase() === "não") {
      return { canalMovimento: "" };
    }
    if (!idCanalValido(limpo)) return undefined;
    return { canalMovimento: limpo };
  }
  return { [campo]: limpo };
}

function nav(aba: AbaAdmin): BotaoAdmin[][] {
  const marca = (id: AbaAdmin, rotulo: string, dados: string): BotaoAdmin => ({
    text: aba === id ? `• ${rotulo}` : rotulo,
    callback_data: dados,
  });
  return [
    [marca("visao", "Painel", "a:v"), marca("contas", "Contas", "a:c"), marca("pix", "PIX", "a:p")],
    [marca("ledger", "Movimento", "a:l"), marca("config", "Tarifas", "a:g"), { text: "Atualizar", callback_data: "a:r" }],
  ];
}

function telaResumo(
  painel: Awaited<ReturnType<typeof painelCarteira>>,
  config: ReturnType<typeof configAtual>,
  agendados: number,
): TelaAdmin {
  const ativas = painel.contas.filter((item) => item.status === "ativa").length;
  const bloqueadas = painel.contas.length - ativas;
  const cartoes = painel.contas.filter((item) => item.cartaoBloqueado).length;
  const abertas = painel.cobrancas.filter((item) => item.status === "aberta");
  const volume = volumeDoDia(painel.ledger);
  const texto = [
    "LINHABANK",
    "Gerência de contas",
    "",
    `Ambiente: ${config.modo === "live" ? "produção" : "homologação"}`,
    `Liquidação PIX: ${rotuloLiquidacao()}`,
    `Custódia: R$ ${reaisDe(painel.totalCentavos)}`,
    `Contas: ${ativas} ativa(s) · ${bloqueadas} bloqueada(s)`,
    `PIX em aberto: ${abertas.length} · R$ ${reaisDe(somaAbertas(painel))}`,
    `Movimento de hoje: + R$ ${reaisDe(volume.credito)}  − R$ ${reaisDe(volume.debito)}`,
    `PIX agendados: ${agendados} · Cartões bloqueados: ${cartoes}`,
    `Canal de movimento: ${config.canalMovimento || "operadores"}`,
    `Base: ${painel.sql ? "contábil SQL" : "contábil interna"}`,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("visao"),
      [
        {
          text: config.modo === "sandbox" ? "• Homologação" : "Homologação",
          callback_data: "a:ms",
        },
        {
          text: config.modo === "live" ? "• Produção" : "Produção",
          callback_data: "a:ml",
        },
      ],
    ],
  };
}

function somaAbertas(painel: Awaited<ReturnType<typeof painelCarteira>>): number {
  return painel.cobrancas
    .filter((item) => item.status === "aberta")
    .reduce((soma, item) => soma + item.valorCentavos, 0);
}

function telaProducao(): TelaAdmin {
  return {
    texto: [
      "Alterar ambiente para produção",
      "",
      "A mudança não contrata liquidação, correspondent banking nem habilitação regulatória.",
      "Confirme somente se o convênio e os controles internos já estiverem vigentes.",
    ].join("\n"),
    teclado: [
      [
        { text: "Confirmar produção", callback_data: "a:my" },
        { text: "Cancelar", callback_data: "a:z" },
      ],
    ],
  };
}

function telaContas(painel: Awaited<ReturnType<typeof painelCarteira>>, pagina: number): TelaAdmin {
  const fatia = paginar(painel.contas, pagina);
  const linhas =
    fatia.itens.length === 0
      ? ["Nenhuma conta corrente."]
      : fatia.itens.map((conta, i) => {
          const indice = fatia.inicio + i;
          return `${indice + 1}. ${conta.numero}  ${conta.nome}\n    R$ ${conta.saldo}  ·  ${rotuloStatus(conta.status)}${conta.cartaoBloqueado ? "  ·  cartão bloqueado" : ""}`;
        });
  const acoes: BotaoAdmin[][] = fatia.itens.map((conta, i) => {
    const indice = fatia.inicio + i;
    return [
      { text: `Ficha ${conta.numero}`, callback_data: `a:d:${indice}` },
      {
        text: conta.status === "bloqueada" ? "Desbloquear" : "Bloquear",
        callback_data: `a:b:${indice}`,
      },
    ];
  });
  return {
    texto: ["Contas correntes  ·  agência 0001", "", ...linhas, fatia.rodape].filter((item) => item.length > 0).join("\n"),
    teclado: [...nav("contas"), [{ text: "Localizar conta", callback_data: "a:q" }], ...acoes, ...fatia.teclado("c")],
  };
}

function telaContasFiltradas(
  painel: Awaited<ReturnType<typeof painelCarteira>>,
  achadas: ContaPainel[],
): TelaAdmin {
  const linhas = achadas.slice(0, 8).map((conta) => {
    const indice = painel.contas.findIndex((item) => item.chatId === conta.chatId);
    return `${conta.numero}  ${conta.nome}  ·  R$ ${conta.saldo}  ·  ${rotuloStatus(conta.status)}`;
  });
  const acoes: BotaoAdmin[][] = achadas.slice(0, 8).map((conta) => {
    const indice = painel.contas.findIndex((item) => item.chatId === conta.chatId);
    return [{ text: `Ficha ${conta.numero}`, callback_data: `a:d:${indice}` }];
  });
  return {
    texto: ["Resultado da localidade", "", ...linhas].join("\n"),
    teclado: [...nav("contas"), ...acoes],
  };
}

function telaFicha(painel: Awaited<ReturnType<typeof painelCarteira>>, indice: number): TelaAdmin {
  const conta = painel.contas[indice];
  if (conta === undefined) {
    return { texto: "Conta não localizada.", teclado: nav("contas") };
  }
  const texto = [
    "Ficha cadastral",
    "",
    `Agência ${conta.agencia}  Conta ${conta.numero}`,
    `Titular: ${conta.nome}`,
    `Situação: ${rotuloStatus(conta.status)}`,
    `Saldo: R$ ${conta.saldo}`,
    `Chave interna: ${conta.chaveInterna}`,
    `Cartão virtual: **** ${conta.cartaoFinal}  ·  ${conta.cartaoBloqueado ? "bloqueado" : "liberado"}`,
    `Abertura: ${quando(conta.aceitouEm)}`,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("contas"),
      [
        {
          text: conta.status === "bloqueada" ? "Desbloquear conta" : "Bloquear conta",
          callback_data: `a:b:${indice}`,
        },
      ],
      [
        {
          text: conta.cartaoBloqueado ? "Liberar cartão" : "Bloquear cartão",
          callback_data: `a:j:${indice}`,
        },
        { text: "Extrato", callback_data: `a:e:${indice}` },
      ],
      [{ text: "Voltar às contas", callback_data: "a:c" }],
    ],
  };
}

async function telaExtrato(
  kv: HostKvApi,
  painel: Awaited<ReturnType<typeof painelCarteira>>,
  indice: number,
): Promise<TelaAdmin> {
  const conta = painel.contas[indice];
  if (conta === undefined) return { texto: "Conta não localizada.", teclado: nav("contas") };
  const lista = await operarConta(kv, conta.chatId, `gerencia:extrato:${conta.chatId}`, { acao: "extrato" });
  const movimentos = (lista.extrato ?? []).slice(-12).reverse();
  const linhas =
    movimentos.length === 0
      ? ["Sem lançamentos."]
      : movimentos.map((item) => {
          const sinal = tipoCredito(item.tipo) ? "+" : "−";
          return `${quando(item.em)}  ${rotuloTipo(item.tipo)}  ${sinal} R$ ${item.valor}${item.comprovante ? `\n    ${item.comprovante}` : ""}`;
        });
  return {
    texto: [`Extrato  ·  ${conta.numero}  ${conta.nome}`, `Saldo R$ ${conta.saldo}`, "", ...linhas].join("\n"),
    teclado: [...nav("contas"), [{ text: "Voltar à ficha", callback_data: `a:d:${indice}` }]],
  };
}

function telaPix(
  painel: Awaited<ReturnType<typeof painelCarteira>>,
  pagina: number,
  modo: string,
  agendados: number,
): TelaAdmin {
  const fatia = paginar(painel.cobrancas, pagina);
  const linhas =
    fatia.itens.length === 0
      ? ["Nenhuma cobrança PIX."]
      : fatia.itens.map((item, i) => {
          const conta = painel.contas.find((c) => c.chatId === item.chatId);
          return `${fatia.inicio + i + 1}. R$ ${item.valor}  ·  ${rotuloCobranca(item.status)}\n    ${conta?.numero ?? item.chatId}  ·  ${item.txid}`;
        });
  const acoes: BotaoAdmin[][] = [];
  for (let i = 0; i < fatia.itens.length; i += 1) {
    const item = fatia.itens[i];
    if (item.status !== "aberta") continue;
    const indice = fatia.inicio + i;
    const row: BotaoAdmin[] = [{ text: `Cancelar ${item.valor}`, callback_data: `a:y:${indice}` }];
    if (modo === "sandbox") row.unshift({ text: `Liquidar R$ ${item.valor}`, callback_data: `a:x:${indice}` });
    acoes.push(row);
  }
  return {
    texto: [
      "Tesouraria PIX",
      `Liquidação: ${rotuloLiquidacao()}`,
      `Agendamentos ativos: ${agendados}`,
      `Transferência entre contas LinhaBank: isenta`,
      "",
      ...linhas,
      fatia.rodape,
    ]
      .filter((item) => item.length > 0)
      .join("\n"),
    teclado: [...nav("pix"), ...acoes, ...fatia.teclado("p")],
  };
}

function telaMovimento(painel: Awaited<ReturnType<typeof painelCarteira>>, pagina: number): TelaAdmin {
  const fatia = paginar(painel.ledger, pagina);
  const linhas =
    fatia.itens.length === 0
      ? ["Sem lançamentos."]
      : fatia.itens.map((item) => {
          const conta = painel.contas.find((c) => c.chatId === item.conta);
          const sinal = item.valorCentavos >= 0 ? "+" : "−";
          return `${quando(item.em)}  ${rotuloTipo(item.tipo)}  ${sinal} R$ ${item.valor}\n    ${conta?.numero ?? item.conta}  ·  ${item.comprovante ?? "s/ comprovante"}`;
        });
  return {
    texto: ["Movimentação  ·  horário de Brasília", "", ...linhas, fatia.rodape].filter((item) => item.length > 0).join("\n"),
    teclado: [...nav("ledger"), ...fatia.teclado("l")],
  };
}

function telaParametros(
  config: ReturnType<typeof configAtual>,
  gateway?: TaxasPsp & { em?: string },
): TelaAdmin {
  const amostra = detalheTaxaPixExterno(10_000);
  const texto = [
    "Parametrização operacional",
    "",
    `Instituição: ${config.nomeExibido}`,
    `Liquidação PIX: ${rotuloLiquidacao()}`,
    `Chave de recebimento: ${config.chaveRecebimento || "não informada"}`,
    `Praça: ${config.cidadeRecebimento}`,
    `Custo da gateway (envio): R$ ${reaisDe(config.taxaGatewayCentavos)}`,
    `Adicional LinhaBank: R$ ${reaisDe(config.taxaCentavos)} + ${config.taxaPercentual}%`,
    `PIX externo cobrado: R$ ${reaisDe(config.taxaGatewayCentavos + config.taxaCentavos)} + ${config.taxaPercentual}%`,
    `Exemplo em R$ 100,00: R$ ${reaisDe(amostra.totalCentavos)}`,
    "Tarifa PIX interno: isento",
    ...linhasTaxasGateway(gateway),
    `Limite por operação: R$ ${reaisDe(config.limiteCentavos)}`,
    `Identificação no atendimento: ${config.prefixoThialinha ? "ativa" : "inativa"}`,
    `Canal digital: ${config.botaoMiniApp ? "ativo" : "inativo"}`,
    `Endereço do canal: ${config.webappUrl || "não informado"}`,
    `Operadores: ${config.chatsAdmin || "—"}`,
    `Canal de movimento: ${config.canalMovimento || "operadores (padrão)"}`,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("config"),
      [
        { text: "Instituição", callback_data: "a:k:n" },
        { text: "Chave PIX", callback_data: "a:k:h" },
        { text: "Praça", callback_data: "a:k:i" },
      ],
      [
        { text: "Adicional R$", callback_data: "a:k:f" },
        { text: "Adicional %", callback_data: "a:k:e" },
        { text: "Limite", callback_data: "a:k:u" },
      ],
      [
        { text: config.prefixoThialinha ? "Atendimento: on" : "Atendimento: off", callback_data: "a:t:p" },
        { text: config.botaoMiniApp ? "Canal: on" : "Canal: off", callback_data: "a:t:b" },
      ],
      [
        { text: "Operadores", callback_data: "a:k:s" },
        { text: "Canal digital", callback_data: "a:k:w" },
        { text: "Canal TG", callback_data: "a:k:m" },
      ],
    ],
  };
}

function telaPendente(campo: CampoPendente): TelaAdmin {
  if (campo === "busca") {
    return {
      texto: [
        "Localizar conta",
        "Informe o número da conta, o nome do titular ou a chave interna.",
      ].join("\n"),
      teclado: [[{ text: "Cancelar", callback_data: "a:z" }]],
    };
  }
  const atual = configAtual();
  const valor = String(atual[campo] ?? "");
  return {
    texto: [
      `Alterar ${ROTULO_CAMPO[campo]}`,
      `Vigente: ${valor.length > 0 ? valor : "não informado"}`,
      DICA_CAMPO[campo],
      "Envie o novo valor.",
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
      if (p > 0) row.push({ text: "Anterior", callback_data: `a:${letra}:${p - 1}` });
      if (p < max) row.push({ text: "Próxima", callback_data: `a:${letra}:${p + 1}` });
      return row.length > 0 ? [row] : [];
    },
  };
}

function filtrarContas(contas: ContaPainel[], termo: string): ContaPainel[] {
  const t = termo.trim().toLowerCase();
  if (t.length === 0) return [];
  return contas.filter(
    (conta) =>
      conta.numero === t ||
      conta.chatId === t ||
      conta.chaveInterna.toLowerCase() === t ||
      conta.nome.toLowerCase().includes(t),
  );
}

function volumeDoDia(ledger: { em: string; valorCentavos: number }[], agora = new Date()): { credito: number; debito: number } {
  const hoje = dataHoraBrasil(agora).data;
  let credito = 0;
  let debito = 0;
  for (const item of ledger) {
    const instante = Date.parse(item.em);
    if (!Number.isFinite(instante)) continue;
    if (dataHoraBrasil(new Date(instante)).data !== hoje) continue;
    if (item.valorCentavos >= 0) credito += item.valorCentavos;
    else debito += Math.abs(item.valorCentavos);
  }
  return { credito, debito };
}

function quando(iso: string): string {
  const instante = Date.parse(iso);
  if (!Number.isFinite(instante)) return iso;
  return formatarQuando(iso);
}

function rotuloTipo(tipo: string): string {
  return ROTULO_MOVIMENTO[tipo] ?? tipo;
}

function rotuloStatus(status: string): string {
  return status === "bloqueada" ? "bloqueada" : "ativa";
}

function rotuloCobranca(status: string): string {
  if (status === "aberta") return "em aberto";
  if (status === "paga") return "liquidada";
  if (status === "cancelada") return "cancelada";
  if (status === "expirada") return "expirada";
  return status;
}

function rotuloEstado(estado: string): string {
  if (estado === "repetido") return "já liquidada";
  if (estado === "live") return "ambiente de produção";
  if (estado === "conta_ausente") return "conta inexistente";
  if (estado === "valor_invalido" || estado === "valor_divergente") return "valor divergente";
  return estado;
}

async function sincronizarTaxasGateway(kv: HostKvApi): Promise<string> {
  const psp = rotuloLiquidacao();
  const taxas = await consultarTaxasGateway();
  if (taxas === undefined) {
    if (psp.startsWith("Asaas")) return "Asaas indisponível. Tarifas não alteradas.";
    if (psp === "convênio ativo") return "Convênio HTTP não informa tarifas. Posição atualizada.";
    return "Posição atualizada.";
  }
  await gravarConfig(kv, { taxaGatewayCentavos: taxas.taxaCentavos });
  await kv.put(CHAVE_TAXAS_GATEWAY, {
    origem: taxas.origem,
    taxaCentavos: taxas.taxaCentavos,
    taxaPercentual: taxas.taxaPercentual,
    recebimentoCentavos: taxas.recebimentoCentavos,
    recebimentoPercentual: taxas.recebimentoPercentual,
    ...(taxas.envioGratisMes !== undefined ? { envioGratisMes: taxas.envioGratisMes } : {}),
    ...(taxas.recebimentoGratisMes !== undefined ? { recebimentoGratisMes: taxas.recebimentoGratisMes } : {}),
    em: new Date().toISOString(),
  });
  return avisoTaxasGateway(taxas);
}

async function lerTaxasGateway(kv: HostKvApi): Promise<(TaxasPsp & { em?: string }) | undefined> {
  const bruto = await kv.get(CHAVE_TAXAS_GATEWAY);
  if (bruto === null || bruto === undefined || typeof bruto !== "object" || Array.isArray(bruto)) return undefined;
  if (typeof bruto.origem !== "string" || typeof bruto.taxaCentavos !== "number") return undefined;
  return {
    origem: bruto.origem,
    taxaCentavos: bruto.taxaCentavos,
    taxaPercentual: typeof bruto.taxaPercentual === "string" ? bruto.taxaPercentual : "0",
    recebimentoCentavos: typeof bruto.recebimentoCentavos === "number" ? bruto.recebimentoCentavos : 0,
    recebimentoPercentual: typeof bruto.recebimentoPercentual === "string" ? bruto.recebimentoPercentual : "0",
    envioGratisMes: typeof bruto.envioGratisMes === "number" ? bruto.envioGratisMes : undefined,
    recebimentoGratisMes: typeof bruto.recebimentoGratisMes === "number" ? bruto.recebimentoGratisMes : undefined,
    em: typeof bruto.em === "string" ? bruto.em : undefined,
  };
}

function linhasTaxasGateway(gateway: (TaxasPsp & { em?: string }) | undefined): string[] {
  if (gateway === undefined) return [];
  const quando = gateway.em !== undefined ? ` · ${formatarQuando(gateway.em)}` : "";
  const envioGratis =
    gateway.envioGratisMes !== undefined && gateway.envioGratisMes > 0 ? ` · ${gateway.envioGratisMes} envios isentos/mês` : "";
  return [
    `Tarifa ${gateway.origem} envio: R$ ${reaisDe(gateway.taxaCentavos)}${envioGratis}`,
    `Tarifa ${gateway.origem} recebimento: R$ ${reaisDe(gateway.recebimentoCentavos)} + ${gateway.recebimentoPercentual}%${quando}`,
  ];
}

function avisoTaxasGateway(taxas: TaxasPsp): string {
  return `Custo ${taxas.origem} atualizado: envio R$ ${reaisDe(taxas.taxaCentavos)}. Adicional LinhaBank inalterado.`;
}

function tipoCredito(tipo: string): boolean {
  return tipo === "pix_recebido" || tipo === "deposito" || tipo === "transferencia_recebida" || tipo === "estorno";
}
