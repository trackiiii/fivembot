import type { HostKvApi } from "@grok/agent-sdk";

import { lerConta, reaisDe } from "../banco.js";
import { voltarMenuSePrecisar } from "../uso/painel.js";
import { lerCofrinho, listarCofrinhos } from "./store.js";
import { linhaPote, progresso, totalGuardadoConta } from "./servico.js";
import type { Cofrinho } from "./tipos.js";

export type BotaoCofrinho = { text: string; callback_data: string };

export type TelaCofrinho = {
  texto: string;
  teclado: BotaoCofrinho[][];
};

export type AcaoCofrinho =
  | { tipo: "home" }
  | { tipo: "novo" }
  | { tipo: "abrir" | "guardar" | "resgatar" | "tudo" | "meta" | "nome" | "encerrar" | "confirmar"; id: string };

const ID = "cf[a-f0-9]{8}";

export function parseAcaoCofrinho(dados: string): AcaoCofrinho | undefined {
  if (dados === "k:h" || dados === "k:n") return dados === "k:n" ? { tipo: "novo" } : { tipo: "home" };
  const achado = dados.match(new RegExp(`^k:(o|g|r|t|m|a|e|y):(${ID})$`));
  if (achado === null || achado[1] === undefined || achado[2] === undefined) return undefined;
  const tipo =
    achado[1] === "o"
      ? "abrir"
      : achado[1] === "g"
        ? "guardar"
        : achado[1] === "r"
          ? "resgatar"
          : achado[1] === "t"
            ? "tudo"
            : achado[1] === "m"
              ? "meta"
              : achado[1] === "a"
                ? "nome"
                : achado[1] === "e"
                  ? "encerrar"
                  : "confirmar";
  return { tipo, id: achado[2] };
}

export function comandoCofrinho(texto: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return limpo === "/cofrinho" || limpo.startsWith("/cofrinho@") || limpo.startsWith("/cofrinho ") || limpo === "/porquinho" || limpo.startsWith("/porquinho@") || limpo.startsWith("/porquinho ");
}

export async function montarCofrinho(kv: HostKvApi, chatId: string, acao: AcaoCofrinho = { tipo: "home" }): Promise<TelaCofrinho | undefined> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return undefined;
  if (acao.tipo === "abrir" || acao.tipo === "encerrar") {
    const pote = await lerCofrinho(kv, acao.id);
    if (pote === undefined || pote.chatId !== chatId || pote.status !== "ativo") return telaHome(kv, chatId);
    if (acao.tipo === "encerrar") return telaEncerrar(pote);
    return telaPote(kv, chatId, pote);
  }
  return telaHome(kv, chatId);
}

async function telaHome(kv: HostKvApi, chatId: string): Promise<TelaCofrinho> {
  const conta = await lerConta(kv, chatId);
  const itens = await listarCofrinhos(kv, chatId);
  const guardado = await totalGuardadoConta(kv, chatId);
  const linhas =
    itens.length === 0
      ? ["Nenhum cofrinho ainda.", "O valor guardado sai do disponível e volta no resgate. Sem tarifa e sem rendimento."]
      : itens.map((item) => linhaPote(item));
  return {
    texto: [
      "LINHABANK",
      "Cofrinho",
      "",
      `Disponível na conta: R$ ${reaisDe(conta?.saldoCentavos ?? 0)}`,
      `Total guardado: R$ ${reaisDe(guardado)}`,
      "",
      ...linhas,
    ].join("\n"),
    teclado: [
      ...itens.map((item) => [{ text: item.nome, callback_data: `k:o:${item.id}` }]),
      [{ text: "Novo cofrinho", callback_data: "k:n" }],
      ...(await voltarMenuSePrecisar(kv, chatId)),
    ],
  };
}

async function telaPote(kv: HostKvApi, chatId: string, pote: Cofrinho): Promise<TelaCofrinho> {
  const conta = await lerConta(kv, chatId);
  const meta =
    pote.metaCentavos > 0 ? `Meta: R$ ${reaisDe(pote.metaCentavos)} · ${progresso(pote)}%` : "Sem meta";
  return {
    texto: [
      "LINHABANK",
      `Cofrinho · ${pote.nome}`,
      "",
      `Guardado: R$ ${reaisDe(pote.saldoCentavos)}`,
      meta,
      `Disponível na conta: R$ ${reaisDe(conta?.saldoCentavos ?? 0)}`,
      "",
      "Guardar retira do disponível. Resgatar devolve. Sem tarifa e sem rendimento.",
    ].join("\n"),
    teclado: [
      [{ text: "Guardar", callback_data: `k:g:${pote.id}` }],
      [{ text: "Resgatar", callback_data: `k:r:${pote.id}` }],
      [{ text: "Resgatar integral", callback_data: `k:t:${pote.id}` }],
      [{ text: "Definir meta", callback_data: `k:m:${pote.id}` }],
      [{ text: "Alterar nome", callback_data: `k:a:${pote.id}` }],
      [{ text: "Encerrar", callback_data: `k:e:${pote.id}` }],
      [{ text: "Voltar", callback_data: "k:h" }],
    ],
  };
}

function telaEncerrar(pote: Cofrinho): TelaCofrinho {
  if (pote.saldoCentavos > 0) {
    return {
      texto: `${pote.nome} ainda tem R$ ${reaisDe(pote.saldoCentavos)}. Resgata antes de encerrar.`,
      teclado: [
        [{ text: "Resgatar integral", callback_data: `k:t:${pote.id}` }],
        [{ text: "Voltar", callback_data: `k:o:${pote.id}` }],
      ],
    };
  }
  return {
    texto: `Encerrar o cofrinho ${pote.nome}? Ele está zerado.`,
    teclado: [
      [{ text: "Confirmar encerramento", callback_data: `k:y:${pote.id}` }],
      [{ text: "Voltar", callback_data: `k:o:${pote.id}` }],
    ],
  };
}

export async function telaDepois(kv: HostKvApi, chatId: string, id?: string): Promise<TelaCofrinho | undefined> {
  if (id === undefined) return montarCofrinho(kv, chatId, { tipo: "home" });
  const pote = await lerCofrinho(kv, id);
  if (pote === undefined || pote.chatId !== chatId || pote.status !== "ativo") return montarCofrinho(kv, chatId, { tipo: "home" });
  return telaPote(kv, chatId, pote);
}
