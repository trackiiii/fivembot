import { timingSafeEqual } from "node:crypto";

import type { HostKvApi } from "@grok/agent-sdk";

import { contarAgendamentosAtivos } from "../agenda.js";
import {
  bloquearCartaoGerencia,
  bloquearConta,
  cancelarCobrancaAberta,
  confirmarCobrancaSandbox,
  listarChatIdsClientes,
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
import { detalheTaxaPixExterno } from "../taxa.js";
import {
  aplicarFotoRascunho,
  aplicarTextoRascunho,
  entregarPrevia,
  enviarAnuncioAosClientes,
  lerRascunho,
  limparRascunho,
  rascunhoVazio,
  telaAnuncio,
  telaConfirmarAnuncio,
} from "./anuncio.js";

export const CHAVE_UI = (chatId: string) => `linhabank:admin:ui:${chatId}`;
export const CHAVE_PENDENTE = (chatId: string) => `linhabank:admin:pendente:${chatId}`;
export const CHAVE_TAXAS_GATEWAY = "linhabank:taxas-gateway";

export type AbaAdmin =
  | "visao"
  | "contas"
  | "pix"
  | "ledger"
  | "config"
  | "mais"
  | "liveok"
  | "ficha"
  | "extrato"
  | "anuncio"
  | "anunciook";
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
  nomeExibido: "nome do banco",
  chaveRecebimento: "chave PIX de recebimento",
  cidadeRecebimento: "cidade da cobrança",
  taxaCentavos: "taxa LinhaBank, em reais",
  taxaPercentual: "taxa LinhaBank, em percentual",
  limiteCentavos: "limite por PIX, em reais",
  webappUrl: "endereço HTTPS do aplicativo",
  chatsAdmin: "chat id dos operadores, separados por vírgula",
  canalMovimento: "canal de movimento no Telegram",
};

const DICA_CAMPO: Record<Exclude<CampoPendente, "busca">, string> = {
  nomeExibido: "2 a 32 caracteres.",
  chaveRecebimento: "E-mail, CPF, CNPJ, telefone ou chave aleatória.",
  cidadeRecebimento: "Até 15 letras, sem acento.",
  taxaCentavos: "Em reais. Ex.: 0,99 ou 1,50. Vale no envio e no depósito. PIX interno continua grátis. Envie 0 para zerar.",
  taxaPercentual: "Ex.: 1,50. Vale no envio e no depósito. Envie 0 para zerar.",
  limiteCentavos: "Em reais. Ex.: 2500,00.",
  webappUrl: "Opcional. Somente HTTPS.",
  chatsAdmin: "Somente números. O seu chat permanece na lista.",
  canalMovimento: "Chat id do canal (ex.: -1001234567890) ou @usuario. Envie - para avisar só os operadores.",
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
  if (ui.aba === "mais") return telaMais(config);
  if (ui.aba === "ficha") return telaFicha(painel, ui.indice ?? 0);
  if (ui.aba === "extrato") return telaExtrato(kv, painel, ui.indice ?? 0);
  if (ui.aba === "anuncio") return telaAnuncio(kv, chatId, nav("anuncio"));
  if (ui.aba === "anunciook") {
    const rascunho = await lerRascunho(kv, chatId);
    return telaConfirmarAnuncio(rascunho, (await listarChatIdsClientes(kv)).length, nav("anuncio"));
  }
  return telaResumo(painel, config, await contarAgendamentosAtivos(kv));
}

export async function aplicarAcao(kv: HostKvApi, chatId: string, dados: string): Promise<ResultadoAdmin> {
  await garantirConfig(kv);
  const acao = parseAcao(dados);
  if (acao === undefined) return { tela: await montarTela(kv, chatId), aviso: "Operação inválida." };
  if (acao.tipo === "cancelar") {
    await kv.delete(CHAVE_PENDENTE(chatId));
    const ui = await lerUi(kv, chatId);
    const aba =
      ui.aba === "liveok"
        ? "visao"
        : ui.aba === "ficha" || ui.aba === "extrato"
          ? "contas"
          : ui.aba === "anunciook"
            ? "anuncio"
            : ui.aba;
    await gravarUi(kv, chatId, { ...ui, aba });
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
  if (acao.tipo === "anuncio_limpar") {
    await limparRascunho(kv, chatId);
    await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
    return { tela: await montarTela(kv, chatId), aviso: "Rascunho apagado." };
  }
  if (acao.tipo === "anuncio_previa") {
    const rascunho = await lerRascunho(kv, chatId);
    if (rascunhoVazio(rascunho)) {
      await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Informe o texto ou anexe uma imagem." };
    }
    await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
    const ok = await entregarPrevia(chatId, rascunho);
    return {
      tela: await montarTela(kv, chatId),
      aviso: ok ? "Prévia enviada nesta conversa." : "Não foi possível enviar a prévia.",
    };
  }
  if (acao.tipo === "anuncio_enviar") {
    const rascunho = await lerRascunho(kv, chatId);
    if (rascunhoVazio(rascunho)) {
      await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Informe o texto ou anexe uma imagem." };
    }
    const destinos = await listarChatIdsClientes(kv);
    if (destinos.length === 0) {
      await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Nenhuma conta para receber o comunicado." };
    }
    await gravarUi(kv, chatId, { aba: "anunciook", pagina: 0 });
    return { tela: await montarTela(kv, chatId) };
  }
  if (acao.tipo === "anuncio_confirmar") {
    const rascunho = await lerRascunho(kv, chatId);
    if (rascunhoVazio(rascunho)) {
      await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
      return { tela: await montarTela(kv, chatId), aviso: "Informe o texto ou anexe uma imagem." };
    }
    const envio = await enviarAnuncioAosClientes(kv, rascunho, chatId);
    await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
    const aviso =
      envio.destinatarios === 0
        ? "Nenhuma conta para receber o comunicado."
        : `Comunicado enviado. ${envio.entregues} entregue(s), ${envio.falhas} falha(s).`;
    return { tela: await montarTela(kv, chatId), aviso };
  }
  if (acao.tipo === "toggle") {
    const atual = configAtual();
    await gravarConfig(kv, { [acao.campo]: !atual[acao.campo] });
    await gravarUi(kv, chatId, { aba: "mais", pagina: 0 });
    return { tela: await montarTela(kv, chatId), aviso: "Ajuste gravado.", atualizarPerfil: true };
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
  if (campo === undefined) {
    const ui = await lerUi(kv, chatId);
    if (ui.aba !== "anuncio" && ui.aba !== "anunciook") return undefined;
    const rascunho = await aplicarTextoRascunho(kv, chatId, texto);
    if (rascunho === undefined) return undefined;
    await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
    return { tela: await montarTela(kv, chatId), aviso: "Texto gravado no rascunho." };
  }
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
    aviso: "Ajuste gravado.",
    atualizarPerfil: campo === "nomeExibido" || campo === "webappUrl" || campo === "chatsAdmin",
  };
}

export async function aplicarMidiaAdmin(
  kv: HostKvApi,
  chatId: string,
  midia: { fotoId?: string; caption?: string },
): Promise<ResultadoAdmin | undefined> {
  const ui = await lerUi(kv, chatId);
  if (ui.aba !== "anuncio" && ui.aba !== "anunciook") return undefined;
  const aplicado = await aplicarFotoRascunho(kv, chatId, midia.fotoId, midia.caption);
  if (aplicado === undefined) {
    await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
    return { tela: await montarTela(kv, chatId), aviso: "Envie a imagem como foto (JPEG, PNG ou WEBP)." };
  }
  await gravarUi(kv, chatId, { aba: "anuncio", pagina: 0 });
  return { tela: await montarTela(kv, chatId), aviso: aplicado.aviso };
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
  | { tipo: "anuncio_limpar" }
  | { tipo: "anuncio_previa" }
  | { tipo: "anuncio_enviar" }
  | { tipo: "anuncio_confirmar" }
  | undefined {
  if (dados === "a:v") return { tipo: "aba", aba: "visao" };
  if (dados === "a:n") return { tipo: "aba", aba: "anuncio" };
  if (dados === "a:nl") return { tipo: "anuncio_limpar" };
  if (dados === "a:np") return { tipo: "anuncio_previa" };
  if (dados === "a:ns") return { tipo: "anuncio_enviar" };
  if (dados === "a:ny") return { tipo: "anuncio_confirmar" };
  if (dados === "a:g") return { tipo: "aba", aba: "config" };
  if (dados === "a:o") return { tipo: "aba", aba: "mais" };
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
    valor === "mais" ||
    valor === "liveok" ||
    valor === "ficha" ||
    valor === "extrato" ||
    valor === "anuncio" ||
    valor === "anunciook"
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
    const n = reaisParaCentavosCampo(limpo, campo === "limiteCentavos" ? 2_000_000 : 500_000);
    if (n === undefined) return undefined;
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
    [marca("visao", "Início", "a:v"), marca("contas", "Contas", "a:c"), marca("pix", "PIX", "a:p")],
    [marca("ledger", "Lançamentos", "a:l"), marca("config", "Ajustes", "a:g"), marca("anuncio", "Anúncio", "a:n")],
  ];
}

function reaisParaCentavosCampo(texto: string, max: number): number | undefined {
  const limpo = texto.trim().replace(/\s/g, "").replace(/^r\$/i, "");
  const achado = limpo.match(/^(\d{1,7})(?:[.,](\d{1,2}))?$/);
  if (achado === null) return undefined;
  const total = Number(achado[1]) * 100 + Number((achado[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(total) || total < 0 || total > max) return undefined;
  return total;
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
    "Gerência",
    "",
    `Saldo das contas: R$ ${reaisDe(painel.totalCentavos)}`,
    `Contas: ${ativas} ativa(s) · ${bloqueadas} bloqueada(s)`,
    `PIX esperando pagamento: ${abertas.length} · R$ ${reaisDe(somaAbertas(painel))}`,
    `Hoje: + R$ ${reaisDe(volume.credito)}  − R$ ${reaisDe(volume.debito)}`,
    `PIX agendados: ${agendados}`,
    cartoes > 0 ? `Cartões bloqueados: ${cartoes}` : "",
    `Ambiente: ${config.modo === "live" ? "produção" : "homologação"} · ${rotuloLiquidacao()}`,
  ]
    .filter((item) => item.length > 0)
    .join("\n");
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
          const tarifa =
            item.taxaCentavos > 0 ? `  ·  entra R$ ${item.liquido}` : "";
          return `${fatia.inicio + i + 1}. R$ ${item.valor}${tarifa}  ·  ${rotuloCobranca(item.status)}\n    ${conta?.numero ?? item.chatId}  ·  ${item.txid}`;
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
      "PIX",
      `Provedor: ${rotuloLiquidacao()}`,
      `Agendamentos: ${agendados}`,
      "Entre contas LinhaBank: grátis",
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
    texto: ["Lançamentos  ·  horário de Brasília", "", ...linhas, fatia.rodape].filter((item) => item.length > 0).join("\n"),
    teclado: [...nav("ledger"), ...fatia.teclado("l")],
  };
}

function telaParametros(
  config: ReturnType<typeof configAtual>,
  gateway?: TaxasPsp & { em?: string },
): TelaAdmin {
  const amostraEnvio = detalheTaxaPixExterno(10_000, "envio");
  const amostraRecebimento = detalheTaxaPixExterno(10_000, "recebimento");
  const qrCem = 10_000 + amostraRecebimento.totalCentavos;
  const quandoGateway = gateway?.em !== undefined ? ` · ${formatarQuando(gateway.em)}` : "";
  const texto = [
    "Ajustes",
    "",
    "TARIFAS",
    "Entre contas LinhaBank: grátis",
    "",
    "Enviar para fora",
    `  Custo ${rotuloLiquidacao()}: R$ ${reaisDe(config.taxaGatewayCentavos)}`,
    `  Taxa LinhaBank: R$ ${reaisDe(config.taxaCentavos)} + ${config.taxaPercentual}%`,
    `  Em R$ 100,00 o cliente paga R$ ${reaisDe(amostraEnvio.totalCentavos)}`,
    "",
    "Receber de fora (depósito)",
    `  Custo ${rotuloLiquidacao()}: R$ ${reaisDe(config.taxaGatewayRecebimentoCentavos)} + ${config.taxaGatewayRecebimentoPercentual}%`,
    `  Taxa LinhaBank: R$ ${reaisDe(config.taxaCentavos)} + ${config.taxaPercentual}%`,
    `  Em R$ 100,00 o QR sai R$ ${reaisDe(qrCem)} (taxa já no PIX)`,
    ...linhasTaxasGateway(gateway, quandoGateway),
    "",
    "CONTA",
    `Nome: ${config.nomeExibido}`,
    `Chave PIX: ${config.chaveRecebimento || "não informada"}`,
    `Cidade: ${config.cidadeRecebimento}`,
    `Limite por PIX: R$ ${reaisDe(config.limiteCentavos)}`,
    `Canal Telegram: ${config.canalMovimento || "operadores"}`,
    `Operadores: ${config.chatsAdmin || "—"}`,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("config"),
      [
        { text: "Taxa R$", callback_data: "a:k:f" },
        { text: "Taxa %", callback_data: "a:k:e" },
        { text: "Puxar Asaas", callback_data: "a:r" },
      ],
      [
        { text: "Nome", callback_data: "a:k:n" },
        { text: "Chave PIX", callback_data: "a:k:h" },
        { text: "Cidade", callback_data: "a:k:i" },
      ],
      [
        { text: "Limite", callback_data: "a:k:u" },
        { text: "Canal", callback_data: "a:k:m" },
        { text: "Operadores", callback_data: "a:k:s" },
      ],
      [{ text: "Mais opções", callback_data: "a:o" }],
    ],
  };
}

function telaMais(config: ReturnType<typeof configAtual>): TelaAdmin {
  const texto = [
    "Mais opções",
    "",
    `Nome no chat: ${config.prefixoThialinha ? "ligado" : "desligado"}`,
    `Aplicativo: ${config.botaoMiniApp ? "ligado" : "desligado"}`,
    `URL do aplicativo: ${config.webappUrl || "não informada"}`,
    `Ambiente: ${config.modo === "live" ? "produção" : "homologação"}`,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav("config"),
      [
        { text: config.prefixoThialinha ? "Nome no chat: on" : "Nome no chat: off", callback_data: "a:t:p" },
        { text: config.botaoMiniApp ? "App: on" : "App: off", callback_data: "a:t:b" },
      ],
      [{ text: "URL do app", callback_data: "a:k:w" }],
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
      [{ text: "Voltar aos ajustes", callback_data: "a:g" }],
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
  const valor = valorCampo(campo, atual);
  return {
    texto: [
      `Alterar ${ROTULO_CAMPO[campo]}`,
      `Hoje: ${valor.length > 0 ? valor : "não informado"}`,
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
  await gravarConfig(kv, {
    taxaGatewayCentavos: taxas.taxaCentavos,
    taxaGatewayRecebimentoCentavos: taxas.recebimentoCentavos,
    taxaGatewayRecebimentoPercentual: taxas.recebimentoPercentual,
  });
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

function valorCampo(campo: Exclude<CampoPendente, "busca">, atual: ReturnType<typeof configAtual>): string {
  if (campo === "taxaCentavos" || campo === "limiteCentavos") return `R$ ${reaisDe(atual[campo])}`;
  return String(atual[campo] ?? "");
}

function linhasTaxasGateway(gateway: (TaxasPsp & { em?: string }) | undefined, quando: string): string[] {
  if (gateway === undefined) return [];
  const envioGratis =
    gateway.envioGratisMes !== undefined && gateway.envioGratisMes > 0 ? ` · ${gateway.envioGratisMes} envios isentos/mês` : "";
  return ["", `Última leitura ${gateway.origem}${quando}${envioGratis}`];
}

function avisoTaxasGateway(taxas: TaxasPsp): string {
  return `Custo ${taxas.origem} atualizado: envio R$ ${reaisDe(taxas.taxaCentavos)}, recebimento R$ ${reaisDe(taxas.recebimentoCentavos)}. Taxa LinhaBank inalterada.`;
}

function tipoCredito(tipo: string): boolean {
  return tipo === "pix_recebido" || tipo === "deposito" || tipo === "transferencia_recebida" || tipo === "estorno";
}
