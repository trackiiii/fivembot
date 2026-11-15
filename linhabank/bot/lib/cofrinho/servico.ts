import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { contaInativa, lerConta, reaisDe, reservarEntreContaEPote } from "../banco.js";
import {
  atualizarCofrinho,
  carregarPote,
  criarCofrinho,
  encerrarCofrinho,
  gravarSaldoPote,
  lerCofrinho,
  listarCofrinhos,
  totalGuardadoConta,
  totalGuardadoGeral,
} from "./store.js";
import { META_MAXIMA_CENTAVOS, MOVIMENTO_MAXIMO_CENTAVOS, type Cofrinho } from "./tipos.js";

export { totalGuardadoConta, totalGuardadoGeral };

const PENDENTE = (chatId: string) => `linhabank:cofrinho:pendente:${chatId}`;

type Pendente =
  | { etapa: "nome" }
  | { etapa: "guardar" | "resgatar" | "meta" | "renomear"; id: string };

export type PedidoFalado =
  | { tipo: "listar" }
  | { tipo: "criar"; nome?: string; metaCentavos: number }
  | { tipo: "guardar"; nome?: string; centavos: number }
  | { tipo: "resgatar"; nome?: string; centavos: number; tudo: boolean }
  | { tipo: "encerrar"; nome?: string }
  | { tipo: "meta"; nome?: string; metaCentavos: number };

export function nomeCofrinho(bruto: string): string | undefined {
  const nome = bruto.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (nome.length < 2 || nome.length > 28) return undefined;
  if (!/^[\p{L}\p{N} ]+$/u.test(nome)) return undefined;
  return nome;
}

export function centavosDeTexto(bruto: string): number | undefined {
  const limpo = bruto.trim().toLowerCase().replace(/\s/g, "").replace(/^r\$/, "");
  const achado = limpo.match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (achado === null) return undefined;
  const total = Number(achado[1]) * 100 + Number((achado[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(total) || total < 1 || total > MOVIMENTO_MAXIMO_CENTAVOS) return undefined;
  return total;
}

export function interpretarPedido(texto: string): PedidoFalado {
  const t = normalizar(texto);
  const nome = extrairNome(texto);
  if (/\b(encerrar|apagar|excluir|fechar)\b/.test(t)) return { tipo: "encerrar", nome };
  if (/\b(criar|cria|abrir|abre|novo cofrinho|novo porquinho|nova caixinha)\b/.test(t)) {
    const meta = /\bmeta\b/.test(t) ? valorNoTrecho(t.split(/\bmeta\b/)[1] ?? "") : 0;
    return { tipo: "criar", nome, metaCentavos: meta ?? 0 };
  }
  if (/\bmeta\b/.test(t)) {
    const meta = valorNoTrecho(t.split(/\bmeta\b/)[1] ?? "");
    return { tipo: "meta", nome, metaCentavos: meta ?? 0 };
  }
  if (/\b(guardar|guarda|separar|separa|colocar|coloca)\b/.test(t)) {
    const centavos = valorNoTrecho(t);
    if (centavos === undefined) return { tipo: "listar" };
    return { tipo: "guardar", nome, centavos };
  }
  if (/\b(resgatar|resgata|tirar|tira|esvaziar|esvazia|sacar|saca)\b/.test(t)) {
    const tudo = /\b(tudo|total|inteiro)\b/.test(t);
    const centavos = valorNoTrecho(t);
    if (!tudo && centavos === undefined) return { tipo: "listar" };
    return { tipo: "resgatar", nome, centavos: centavos ?? 0, tudo };
  }
  return { tipo: "listar" };
}

export async function executarTexto(kv: HostKvApi, chatId: string, texto: string, idempotencyKey: string): Promise<string> {
  const pedido = interpretarPedido(texto);
  if (pedido.tipo === "listar") return textoLista(kv, chatId);
  if (pedido.tipo === "criar") {
    if (pedido.nome === undefined) {
      await gravarPendente(kv, chatId, { etapa: "nome" });
      return "Qual o nome do cofrinho?";
    }
    return textoCriar(kv, chatId, pedido.nome, pedido.metaCentavos);
  }
  if (pedido.tipo === "guardar") return textoMover(kv, chatId, "guardar", pedido.centavos, pedido.nome, idempotencyKey);
  if (pedido.tipo === "resgatar") {
    return textoMover(kv, chatId, "resgatar", pedido.tudo ? 0 : pedido.centavos, pedido.nome, idempotencyKey, pedido.tudo);
  }
  if (pedido.tipo === "encerrar") return textoEncerrar(kv, chatId, pedido.nome);
  return textoMeta(kv, chatId, pedido.metaCentavos, pedido.nome);
}

export async function seguirPendente(
  kv: HostKvApi,
  chatId: string,
  texto: string,
  idempotencyKey: string,
): Promise<{ tratado: false } | { tratado: true; texto: string; id?: string }> {
  const pendente = await lerPendente(kv, chatId);
  if (pendente === undefined) return { tratado: false };
  if (texto.trim().startsWith("/")) {
    await limparPendente(kv, chatId);
    return { tratado: false };
  }
  if (pendente.etapa === "nome" || pendente.etapa === "renomear") {
    const nome = nomeCofrinho(texto);
    if (nome === undefined) return { tratado: true, texto: "O nome precisa ter de 2 a 28 letras ou números.", id: pendente.etapa === "renomear" ? pendente.id : undefined };
    await limparPendente(kv, chatId);
    if (pendente.etapa === "nome") return { tratado: true, texto: await textoCriar(kv, chatId, nome, 0), id: undefined };
    const atualizado = await atualizarCofrinho(kv, chatId, pendente.id, { nome });
    if (!atualizado.ok) return { tratado: true, texto: mensagemCadastro(atualizado.motivo), id: pendente.id };
    return { tratado: true, texto: `O cofrinho agora se chama ${atualizado.cofrinho.nome}.`, id: pendente.id };
  }
  if (pendente.etapa === "meta") {
    const meta = texto.trim().toLowerCase() === "0" || /^sem$/.test(normalizar(texto)) ? 0 : centavosDeTexto(texto);
    if (meta === undefined || meta > META_MAXIMA_CENTAVOS) {
      return { tratado: true, texto: "Manda a meta em reais, tipo 500 ou 0 pra tirar.", id: pendente.id };
    }
    await limparPendente(kv, chatId);
    return { tratado: true, texto: await textoMeta(kv, chatId, meta, undefined, pendente.id), id: pendente.id };
  }
  const centavos = centavosDeTexto(texto);
  if (centavos === undefined) return { tratado: true, texto: "Manda o valor em reais, tipo 50 ou 10,50.", id: pendente.id };
  await limparPendente(kv, chatId);
  const textoMovimento = await textoMover(kv, chatId, pendente.etapa, centavos, undefined, idempotencyKey, false, pendente.id);
  return { tratado: true, texto: textoMovimento, id: pendente.id };
}

export async function pedirNome(kv: HostKvApi, chatId: string): Promise<void> {
  await gravarPendente(kv, chatId, { etapa: "nome" });
}

export async function pedirValor(kv: HostKvApi, chatId: string, etapa: "guardar" | "resgatar" | "meta" | "renomear", id: string): Promise<void> {
  await gravarPendente(kv, chatId, { etapa, id });
}

export async function limparPendente(kv: HostKvApi, chatId: string): Promise<void> {
  await kv.delete(PENDENTE(chatId));
}

export async function guardarCofrinho(
  kv: HostKvApi,
  chatId: string,
  id: string,
  centavos: number,
  idempotencyKey: string,
): Promise<{ ok: true; saldoCentavos: number; pote: Cofrinho; comprovante: string } | { ok: false; motivo: string }> {
  return mover(kv, chatId, id, centavos, "guardar", idempotencyKey);
}

export async function resgatarCofrinho(
  kv: HostKvApi,
  chatId: string,
  id: string,
  centavos: number,
  idempotencyKey: string,
  tudo = false,
): Promise<{ ok: true; saldoCentavos: number; pote: Cofrinho; comprovante: string } | { ok: false; motivo: string }> {
  const pote = await lerCofrinho(kv, id);
  if (pote === undefined || pote.chatId !== chatId) return { ok: false, motivo: "nao_acha" };
  const valor = tudo ? pote.saldoCentavos : centavos;
  if (valor < 1) return { ok: false, motivo: tudo ? "vazio" : "valor_invalido" };
  return mover(kv, chatId, id, valor, "resgatar", idempotencyKey);
}

async function mover(
  kv: HostKvApi,
  chatId: string,
  id: string,
  centavos: number,
  direcao: "guardar" | "resgatar",
  idempotencyKey: string,
): Promise<{ ok: true; saldoCentavos: number; pote: Cofrinho; comprovante: string } | { ok: false; motivo: string }> {
  const pote = await lerCofrinho(kv, id);
  if (pote === undefined || pote.chatId !== chatId || pote.status !== "ativo") return { ok: false, motivo: "nao_acha" };
  const resultado = await reservarEntreContaEPote(kv, {
    idempotencyKey,
    chatId,
    centavos,
    direcao,
    descricao: `Cofrinho ${pote.nome}`.slice(0, 80),
    poteId: id,
    carregarPote: (poteId) => carregarPote(kv, poteId),
    gravarSaldoPote: (poteId, saldo) => gravarSaldoPote(kv, poteId, saldo),
  });
  if (!resultado.ok) return resultado;
  const atual = await lerCofrinho(kv, id);
  if (atual === undefined) return { ok: false, motivo: "nao_acha" };
  return { ok: true, saldoCentavos: resultado.saldoCentavos, pote: atual, comprovante: resultado.comprovante };
}

async function textoLista(kv: HostKvApi, chatId: string): Promise<string> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return "Abre a conta com /start pra ter cofrinho.";
  const itens = await listarCofrinhos(kv, chatId);
  const guardado = itens.reduce((soma, item) => soma + item.saldoCentavos, 0);
  if (itens.length === 0) {
    return `Na conta tem R$ ${reaisDe(conta.saldoCentavos)} disponível. Você ainda não tem cofrinho. Manda o nome pra criar, ou abre /cofrinho.`;
  }
  const linhas = itens.map((item) => linhaPote(item));
  return [`Guardado: R$ ${reaisDe(guardado)}. Na conta: R$ ${reaisDe(conta.saldoCentavos)}.`, ...linhas].join("\n");
}

async function textoCriar(kv: HostKvApi, chatId: string, nome: string, metaCentavos: number): Promise<string> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return "Abre a conta com /start pra ter cofrinho.";
  if (contaInativa(conta.status)) return "A conta está desativada. Dá pra ver e resgatar o que já está no cofrinho, mas não criar agora.";
  const meta = metaCentavos > META_MAXIMA_CENTAVOS ? -1 : metaCentavos;
  if (meta < 0) return "Essa meta passou do limite. Manda um valor menor.";
  const criado = await criarCofrinho(kv, chatId, nome, meta);
  if (!criado.ok) return mensagemCadastro(criado.motivo);
  const metaTexto = meta > 0 ? ` Meta de R$ ${reaisDe(meta)}.` : "";
  return `Criei o cofrinho ${criado.cofrinho.nome}.${metaTexto} Ainda está zerado.`;
}

async function textoMover(
  kv: HostKvApi,
  chatId: string,
  direcao: "guardar" | "resgatar",
  centavos: number,
  nome: string | undefined,
  idempotencyKey: string,
  tudo = false,
  idFixo?: string,
): Promise<string> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return "Abre a conta com /start pra ter cofrinho.";
  if (direcao === "guardar" && contaInativa(conta.status)) {
    return "A conta está desativada. Dá pra resgatar o cofrinho, mas não guardar agora.";
  }
  const pote = idFixo !== undefined ? await lerCofrinho(kv, idFixo) : await escolher(kv, chatId, nome);
  if (pote === undefined || ("motivo" in pote && pote.motivo !== undefined)) {
    return pote !== undefined && "motivo" in pote ? mensagemEscolha(pote.motivo) : "Não achei esse cofrinho.";
  }
  const alvo = "id" in pote ? pote : undefined;
  if (alvo === undefined || alvo.chatId !== chatId) return "Não achei esse cofrinho.";
  const antes = alvo.saldoCentavos;
  const resultado =
    direcao === "guardar"
      ? await guardarCofrinho(kv, chatId, alvo.id, centavos, idempotencyKey)
      : await resgatarCofrinho(kv, chatId, alvo.id, centavos, idempotencyKey, tudo);
  if (!resultado.ok) return mensagemMovimento(resultado.motivo, direcao);
  const movido = Math.abs(resultado.pote.saldoCentavos - antes) || centavos;
  const verbo = direcao === "guardar" ? "Guardei" : "Resgatei";
  return `${verbo} R$ ${reaisDe(movido)} em ${resultado.pote.nome}. Cofrinho: R$ ${reaisDe(resultado.pote.saldoCentavos)}. Conta: R$ ${reaisDe(resultado.saldoCentavos)}. Comprovante ${resultado.comprovante}.`;
}

async function textoEncerrar(kv: HostKvApi, chatId: string, nome: string | undefined, idFixo?: string): Promise<string> {
  const pote = idFixo !== undefined ? await lerCofrinho(kv, idFixo) : await escolher(kv, chatId, nome);
  if (pote === undefined || ("motivo" in pote && pote.motivo !== undefined)) {
    return pote !== undefined && "motivo" in pote ? mensagemEscolha(pote.motivo) : "Não achei esse cofrinho.";
  }
  const alvo = "saldoCentavos" in pote ? pote : undefined;
  if (alvo === undefined || alvo.chatId !== chatId) return "Não achei esse cofrinho.";
  const encerrado = await encerrarCofrinho(kv, chatId, alvo.id);
  if (!encerrado.ok) {
    if (encerrado.motivo === "com_saldo") return `${alvo.nome} ainda tem R$ ${reaisDe(alvo.saldoCentavos)}. Resgata antes de encerrar.`;
    return "Esse cofrinho já foi encerrado.";
  }
  return `Encerrei o cofrinho ${encerrado.cofrinho.nome}.`;
}

async function textoMeta(kv: HostKvApi, chatId: string, metaCentavos: number, nome?: string, idFixo?: string): Promise<string> {
  if (metaCentavos > META_MAXIMA_CENTAVOS) return "Essa meta passou do limite.";
  const pote = idFixo !== undefined ? await lerCofrinho(kv, idFixo) : await escolher(kv, chatId, nome);
  if (pote === undefined || ("motivo" in pote && pote.motivo !== undefined)) {
    return pote !== undefined && "motivo" in pote ? mensagemEscolha(pote.motivo) : "Não achei esse cofrinho.";
  }
  const alvo = "id" in pote ? pote : undefined;
  if (alvo === undefined || alvo.chatId !== chatId) return "Não achei esse cofrinho.";
  const atualizado = await atualizarCofrinho(kv, chatId, alvo.id, { metaCentavos });
  if (!atualizado.ok) return mensagemCadastro(atualizado.motivo);
  if (metaCentavos === 0) return `${atualizado.cofrinho.nome} ficou sem meta.`;
  return `A meta de ${atualizado.cofrinho.nome} ficou R$ ${reaisDe(metaCentavos)}.`;
}

export async function encerrarPorId(kv: HostKvApi, chatId: string, id: string): Promise<string> {
  return textoEncerrar(kv, chatId, undefined, id);
}

async function escolher(
  kv: HostKvApi,
  chatId: string,
  nome: string | undefined,
): Promise<Cofrinho | { motivo: "nenhum" | "varios" | "nao_acha" }> {
  const itens = await listarCofrinhos(kv, chatId);
  if (nome !== undefined) {
    const achado = itens.find((item) => item.nome.toLowerCase() === nome.toLowerCase());
    return achado ?? { motivo: "nao_acha" };
  }
  if (itens.length === 0) return { motivo: "nenhum" };
  if (itens.length > 1) return { motivo: "varios" };
  return itens[0] as Cofrinho;
}

function mensagemEscolha(motivo: "nenhum" | "varios" | "nao_acha"): string {
  if (motivo === "nenhum") return "Você ainda não tem cofrinho. Manda o nome pra criar.";
  if (motivo === "varios") return "Você tem mais de um cofrinho. Fala o nome, tipo no cofrinho viagem.";
  return "Não achei um cofrinho com esse nome.";
}

function mensagemCadastro(motivo: string): string {
  if (motivo === "limite") return "Dá pra ter até 8 cofrinhos. Encerra um zerado pra abrir outro.";
  if (motivo === "nome_em_uso") return "Já existe um cofrinho com esse nome.";
  if (motivo === "sem_conta") return "Abre a conta com /start pra ter cofrinho.";
  return "Não consegui mudar esse cofrinho.";
}

function mensagemMovimento(motivo: string, direcao: "guardar" | "resgatar"): string {
  if (motivo === "saldo_insuficiente") return "Não deu. O disponível na conta é menor que esse valor. O que está no cofrinho continua lá.";
  if (motivo === "cofrinho_insuficiente") return "No cofrinho não tem esse valor. A conta não mudou.";
  if (motivo === "conta_bloqueada") return "A conta está desativada. Dá pra resgatar, mas não guardar agora.";
  if (motivo === "vazio") return "Esse cofrinho já está zerado.";
  if (motivo === "valor_invalido") return "Manda o valor em reais, tipo 50 ou 10,50.";
  if (motivo === "nao_acha" || motivo === "cofrinho_indisponivel") return "Não achei esse cofrinho aberto.";
  return direcao === "guardar" ? "Não guardei. A conta continua igual." : "Não resgatei. A conta continua igual.";
}

export function linhaPote(pote: Cofrinho): string {
  const meta = pote.metaCentavos > 0 ? `, meta R$ ${reaisDe(pote.metaCentavos)} (${progresso(pote)}%)` : "";
  return `${pote.nome}: R$ ${reaisDe(pote.saldoCentavos)}${meta}`;
}

export function progresso(pote: Cofrinho): number {
  if (pote.metaCentavos <= 0) return 0;
  return Math.min(100, Math.floor((pote.saldoCentavos * 100) / pote.metaCentavos));
}

async function gravarPendente(kv: HostKvApi, chatId: string, pendente: Pendente): Promise<void> {
  await kv.put(PENDENTE(chatId), pendente);
}

async function lerPendente(kv: HostKvApi, chatId: string): Promise<Pendente | undefined> {
  const item = comoObjeto(await kv.get(PENDENTE(chatId)));
  if (item === undefined) return undefined;
  if (item.etapa === "nome") return { etapa: "nome" };
  if (
    (item.etapa === "guardar" || item.etapa === "resgatar" || item.etapa === "meta" || item.etapa === "renomear") &&
    typeof item.id === "string"
  ) {
    return { etapa: item.etapa, id: item.id };
  }
  return undefined;
}

function comoObjeto(valor: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s,./]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairNome(texto: string): string | undefined {
  const achado = texto.match(/\b(?:cofrinho|porquinho|caixinha)\s+(.+)$/i);
  if (achado?.[1] === undefined) return undefined;
  let nome = achado[1].replace(/\bmeta\b.*$/i, "").replace(/\d[\d.,]*/g, " ").replace(/\s+/g, " ").trim();
  nome = nome.replace(/^(no|na|do|da|de|o|a)\s+/i, "").trim();
  return nomeCofrinho(nome);
}

function valorNoTrecho(texto: string): number | undefined {
  const achado = texto.match(/(\d{1,7})(?:[.,](\d{1,2}))?/);
  if (achado === null) return undefined;
  const total = Number(achado[1]) * 100 + Number((achado[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(total) || total < 0 || total > META_MAXIMA_CENTAVOS) return undefined;
  return total;
}
