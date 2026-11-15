import type { HostKvApi } from "@grok/agent-sdk";

import { formatarQuando } from "../horario.js";
import {
  consultarClube,
  historicoCategoria,
  historicoRecompensas,
  indicacoesDe,
  rotuloCategoria,
  type CategoriaClube,
  type ResumoClube,
} from "../fidelidade/index.js";
import { configAtual } from "../config.js";

export type BotaoClube = { text: string; callback_data: string };

export type TelaClube = {
  texto: string;
  teclado: BotaoClube[][];
};

export type AbaClube = "home" | "categoria" | "saldo" | "indicar" | "indicacoes" | "historico" | "como" | "beneficios";

function nav(aba: AbaClube): BotaoClube[][] {
  const marca = (id: AbaClube, rotulo: string, dados: string): BotaoClube => ({
    text: aba === id ? `• ${rotulo}` : rotulo,
    callback_data: dados,
  });
  return [
    [marca("categoria", "Categoria", "c:t"), marca("saldo", "LBcoins", "c:s"), marca("indicar", "Indicar", "c:i")],
    [marca("indicacoes", "Indicações", "c:m"), marca("historico", "Histórico", "c:r")],
    [marca("como", "Como ganhar", "c:g"), marca("beneficios", "Benefícios", "c:b")],
    [{ text: "Club", callback_data: "c:h" }],
  ];
}

export function parseAcaoClube(dados: string): AbaClube | undefined {
  if (dados === "c:h") return "home";
  if (dados === "c:t") return "categoria";
  if (dados === "c:s") return "saldo";
  if (dados === "c:i") return "indicar";
  if (dados === "c:m") return "indicacoes";
  if (dados === "c:r") return "historico";
  if (dados === "c:g") return "como";
  if (dados === "c:b") return "beneficios";
  return undefined;
}

export async function montarClube(kv: HostKvApi, chatId: string, aba: AbaClube = "home"): Promise<TelaClube | undefined> {
  const resumo = await consultarClube(kv, chatId);
  if (resumo === undefined) return undefined;
  if (aba === "categoria") return telaCategoria(kv, chatId, resumo);
  if (aba === "saldo") return telaSaldo(kv, chatId, resumo);
  if (aba === "indicar") return telaIndicar(resumo);
  if (aba === "indicacoes") return telaIndicacoes(kv, chatId, resumo);
  if (aba === "historico") return telaHistorico(kv, chatId, resumo);
  if (aba === "como") return telaComo(resumo);
  if (aba === "beneficios") return telaBeneficios(resumo);
  return telaHome(resumo);
}

function telaHome(resumo: ResumoClube): TelaClube {
  return {
    texto: [
      "⭐ LINHABANK CLUB",
      "",
      `Categoria: ${rotuloCategoria(resumo.categoria)} · ${resumo.xp} XP`,
      `LBcoins: ${resumo.saldo}`,
      `Indicações aprovadas: ${resumo.aprovadas} · pendentes: ${resumo.pendentes}`,
      "",
      "LBcoins são pontos de fidelidade. Não são saldo, Pix nem dinheiro sacável.",
    ].join("\n"),
    teclado: nav("home"),
  };
}

async function telaCategoria(kv: HostKvApi, chatId: string, resumo: ResumoClube): Promise<TelaClube> {
  const cfg = configAtual();
  const falta = faltaPara(resumo.xp, resumo.categoria, cfg.xpPrata, cfg.xpOuro);
  const historico = await historicoCategoria(kv, chatId);
  const linhas =
    historico.length === 0
      ? ["Ainda não houve mudança de categoria."]
      : historico.slice(0, 5).map((item) => `${formatarQuando(item.em)}  ${rotuloCategoria(item.de)} → ${rotuloCategoria(item.para)}`);
  return {
    texto: [
      "Minha categoria",
      "",
      `Agora: ${rotuloCategoria(resumo.categoria)}`,
      `XP: ${resumo.xp}`,
      `Bronze 0–${cfg.xpPrata - 1} · Prata ${cfg.xpPrata}–${cfg.xpOuro - 1} · Ouro ${cfg.xpOuro}+`,
      falta,
      "",
      "EVOLUÇÃO",
      ...linhas,
    ].join("\n"),
    teclado: nav("categoria"),
  };
}

async function telaSaldo(kv: HostKvApi, chatId: string, resumo: ResumoClube): Promise<TelaClube> {
  const hist = await historicoRecompensas(kv, chatId, 5);
  const linhas =
    hist.length === 0
      ? ["Ainda não há recompensas."]
      : hist.map((item) => `${formatarQuando(item.em)}  +${item.quantidade}  ${item.descricao}`);
  return {
    texto: [
      "Meu saldo LBcoins",
      "",
      `Saldo: ${resumo.saldo}`,
      `Recebidos: ${resumo.totalRecebido} · utilizados: ${resumo.totalUtilizado}`,
      "",
      "LBcoins não representam dinheiro nem Pix.",
      "",
      ...linhas,
    ].join("\n"),
    teclado: nav("saldo"),
  };
}

function telaIndicar(resumo: ResumoClube): TelaClube {
  const cfg = configAtual();
  const criterio = cfg.indicacaoCriterio === "conta_aberta" ? "quando a pessoa abrir a conta neste chat" : "depois da análise da gerência";
  return {
    texto: [
      "LINHABANK INDIQUE E GANHE",
      "",
      `Seu código: ${resumo.codigo}`,
      `Seu convite: ${resumo.link}`,
      "",
      `Recompensa vigente: ${cfg.lbcoinsIndicacao} LBcoins por indicação aprovada.`,
      `A recompensa só cai ${criterio}. Começar o bot, sozinho, não credita.`,
      "",
      "Você não pode indicar a si mesmo. Cada pessoa só pode ser indicada uma vez.",
    ].join("\n"),
    teclado: nav("indicar"),
  };
}

async function telaIndicacoes(kv: HostKvApi, chatId: string, resumo: ResumoClube): Promise<TelaClube> {
  const lista = await indicacoesDe(kv, chatId);
  const linhas =
    lista.length === 0
      ? ["Você ainda não indicou ninguém."]
      : lista.slice(0, 8).map((item) => `${formatarQuando(item.criadoEm)}  ${rotuloStatus(item.status)}`);
  return {
    texto: [
      "Minhas indicações",
      "",
      `Total: ${resumo.indicadas}`,
      `Aprovadas: ${resumo.aprovadas} · pendentes: ${resumo.pendentes} · recusadas: ${resumo.rejeitadas}`,
      `LBcoins já ganhos indicando: ${resumo.ganhoIndicacao}`,
      "",
      ...linhas,
    ].join("\n"),
    teclado: nav("indicacoes"),
  };
}

async function telaHistorico(kv: HostKvApi, chatId: string, resumo: ResumoClube): Promise<TelaClube> {
  const hist = await historicoRecompensas(kv, chatId, 10);
  const linhas =
    hist.length === 0
      ? ["Sem recompensas ainda."]
      : hist.map((item) => `${formatarQuando(item.em)}  +${item.quantidade} ${item.tipo} · ${item.descricao}`);
  return {
    texto: ["Histórico de recompensas", "", `Saldo atual: ${resumo.saldo}`, "", ...linhas].join("\n"),
    teclado: nav("historico"),
  };
}

function telaComo(resumo: ResumoClube): TelaClube {
  const cfg = configAtual();
  return {
    texto: [
      "Como ganhar LBcoins",
      "",
      `1. Indique pelo seu link. Cada indicação aprovada vale ${cfg.lbcoinsIndicacao} LBcoins.`,
      "2. A gerência pode lançar bônus de campanha. Só entra o que o sistema registrar.",
      "3. Não existe resgate em Pix. LBcoins não saem da conta em dinheiro.",
      "",
      `Seu código agora: ${resumo.codigo}`,
    ].join("\n"),
    teclado: nav("como"),
  };
}

function telaBeneficios(resumo: ResumoClube): TelaClube {
  return {
    texto: [
      `Benefícios · ${rotuloCategoria(resumo.categoria)}`,
      "",
      ...resumo.beneficios.map((item, i) => `${i + 1}. ${item}`),
      "",
      "Só listamos o que já existe. Campanha inexistente não aparece como benefício.",
    ].join("\n"),
    teclado: nav("beneficios"),
  };
}

function faltaPara(xp: number, categoria: CategoriaClube, prata: number, ouro: number): string {
  if (categoria === "bronze") {
    const falta = Math.max(0, prata - xp);
    return falta === 0 ? "Você já pode ir para Prata." : `Faltam ${falta} XP para Prata.`;
  }
  if (categoria === "prata") {
    const falta = Math.max(0, ouro - xp);
    return falta === 0 ? "Você já pode ir para Ouro." : `Faltam ${falta} XP para Ouro.`;
  }
  return "Você já está no Ouro.";
}

function rotuloStatus(status: string): string {
  if (status === "aprovada") return "aprovada";
  if (status === "rejeitada") return "recusada";
  return "pendente";
}
