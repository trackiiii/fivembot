import type { HostKvApi } from "@grok/agent-sdk";

import { configAtual } from "../config.js";
import {
  consultarClube,
  criterioRotulo,
  historicoLbcoins,
  listarAuditoria,
  listarPendentes,
  rotuloCategoria,
} from "../fidelidade/index.js";
import { formatarQuando } from "../horario.js";
import type { BotaoAdmin, TelaAdmin } from "./painel.js";

export async function telaClube(kv: HostKvApi, nav: BotaoAdmin[][]): Promise<TelaAdmin> {
  const cfg = configAtual();
  const pendentes = await listarPendentes(kv);
  const auditoria = await listarAuditoria(kv, 4);
  const linhasPendentes =
    pendentes.length === 0
      ? ["Nenhuma indicação pendente."]
      : pendentes.slice(0, 4).map((item, i) => `${i + 1}. ${item.codigo}  ·  ${formatarQuando(item.criadoEm)}`);
  const linhasAudit =
    auditoria.length === 0
      ? []
      : ["", "AUDITORIA", ...auditoria.map((item) => `${formatarQuando(item.em)}  ${item.acao}`)];
  const texto = [
    "Clube",
    "LBcoins, indicações e categorias.",
    "",
    `Recompensa por indicação: ${cfg.lbcoinsIndicacao} LBcoins`,
    `Critério: ${criterioRotulo(cfg.indicacaoCriterio)}`,
    `XP Prata: ${cfg.xpPrata} · XP Ouro: ${cfg.xpOuro} · XP por indicação: ${cfg.xpIndicacao}`,
    `Indicações pendentes: ${pendentes.length}`,
    "",
    "PENDENTES",
    ...linhasPendentes,
    ...linhasAudit,
    "",
    "LBcoins não são saldo em real.",
  ].join("\n");
  const acoes: BotaoAdmin[][] = pendentes.slice(0, 4).flatMap((_, i) => [
    [{ text: `Aprovar ${i + 1}`, callback_data: `a:ia:${i}` }],
    [{ text: `Recusar ${i + 1}`, callback_data: `a:ir:${i}` }],
  ]);
  return {
    texto,
    teclado: [
      [{ text: "LBcoins indicação", callback_data: "a:k:l" }],
      [{ text: "XP indicação", callback_data: "a:k:x" }],
      [{ text: cfg.indicacaoCriterio === "manual" ? "• Análise" : "Análise", callback_data: "a:ic:m" }],
      [{ text: cfg.indicacaoCriterio === "conta_aberta" ? "• Conta aberta" : "Conta aberta", callback_data: "a:ic:c" }],
      [{ text: "XP Prata", callback_data: "a:k:p" }],
      [{ text: "XP Ouro", callback_data: "a:k:q" }],
      [{ text: "Texto Prata", callback_data: "a:k:j" }],
      [{ text: "Texto Ouro", callback_data: "a:k:y" }],
      ...acoes,
      ...nav,
    ],
  };
}

export async function blocoFichaClube(kv: HostKvApi, chatId: string): Promise<string[]> {
  const resumo = await consultarClube(kv, chatId);
  if (resumo === undefined) return ["Clube: sem carteira de LBcoins."];
  return [
    "",
    "CLUBE",
    `Categoria ${rotuloCategoria(resumo.categoria)} · ${resumo.xp} XP`,
    `LBcoins: ${resumo.saldo} (recebidos ${resumo.totalRecebido} · usados ${resumo.totalUtilizado})`,
    `Código: ${resumo.codigo}`,
    `Indicações: ${resumo.aprovadas} aprovada(s) · ${resumo.pendentes} pendente(s)`,
    resumo.recompensasBloqueadas ? "Recompensas bloqueadas." : "Recompensas liberadas.",
  ];
}

export async function telaMovimentoClube(kv: HostKvApi, chatId: string, nome: string, nav: BotaoAdmin[][]): Promise<TelaAdmin> {
  const lista = await historicoLbcoins(kv, chatId, 12);
  const linhas =
    lista.length === 0
      ? ["Sem movimentação de LBcoins."]
      : lista.map((item) => `${formatarQuando(item.em)}  ${item.quantidade > 0 ? "+" : ""}${item.quantidade}  ${item.tipo}\n    ${item.descricao}`);
  return {
    texto: [`LBcoins  ·  ${nome}`, "", ...linhas].join("\n"),
    teclado: nav,
  };
}
