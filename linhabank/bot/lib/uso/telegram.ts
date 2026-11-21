import type { HostKvApi } from "@grok/agent-sdk";

import { enviarFoto, enviarMensagem, responderCallback, type Atualizacao } from "../atendimento.js";
import { centavosDe, lerConta, operarConta, reaisDe } from "../banco.js";
import { abrirClube } from "../clube/telegram.js";
import { abrirCofrinho } from "../cofrinho/telegram.js";
import { pngCopiaECola } from "../qr.js";
import { RESPOSTA_DEPOSITO_PENDENTE, RESPOSTA_PIX_INDISPONIVEL, RESPOSTA_SEM_CONTA } from "../respostas.js";
import {
  aplicarModo,
  cancelarDoMenu,
  comandoConversa,
  comandoEscolher,
  comandoMenu,
  contaBloqueada,
  iniciarEnviar,
  iniciarReceber,
  interpretarPedidoUso,
  montarMenu,
  parseAcaoUso,
  telaAgendamentos,
  telaAjudaMenu,
  telaConfirmarPix,
  telaErro,
  telaEscolher,
  telaExtrato,
  telaPedirValor,
  telaPixEnviado,
  telaSaldo,
  tecladoTrocarMenu,
  textoDepositoMenu,
  type AcaoUso,
} from "./painel.js";
import { gravarPendenteUso, lerModoUso, lerPendenteUso, limparPendenteUso } from "./store.js";
import type { TelaUso } from "./tipos.js";

type Callback = Extract<Atualizacao, { tipo: "callback" }>;

export { comandoConversa, comandoEscolher, comandoMenu, telaEscolher, tecladoTrocarMenu } from "./painel.js";
export { lerModoUso } from "./store.js";

export async function precisaEscolherUso(kv: HostKvApi, chatId: string): Promise<boolean> {
  if ((await lerConta(kv, chatId)) === undefined) return false;
  return (await lerModoUso(kv, chatId)) === undefined;
}

export async function enviarEscolhaUso(chatId: string, mensagemId?: number): Promise<void> {
  const tela = telaEscolher();
  await enviarMensagem(chatId, tela.texto, {
    prefixo: false,
    teclado: tela.teclado,
    ...(mensagemId !== undefined ? { replyTo: mensagemId } : {}),
  });
}

export async function abrirMenu(kv: HostKvApi, chatId: string, mensagemId?: number): Promise<boolean> {
  await aplicarModo(kv, chatId, "menu");
  const tela = await montarMenu(kv, chatId);
  if (tela === undefined) {
    await enviarMensagem(chatId, RESPOSTA_SEM_CONTA, mensagemId !== undefined ? { replyTo: mensagemId } : {});
    return false;
  }
  await enviarMensagem(chatId, tela.texto, {
    prefixo: false,
    teclado: tela.teclado,
    ...(mensagemId !== undefined ? { replyTo: mensagemId } : {}),
  });
  return true;
}

export async function tratarCallbackUso(kv: HostKvApi, atualizacao: Callback): Promise<void> {
  const acao = parseAcaoUso(atualizacao.dados);
  if (acao === undefined) {
    await responderCallback(atualizacao.callbackId, "Opção inválida.");
    return;
  }
  if ((await lerConta(kv, atualizacao.chatId)) === undefined) {
    await responderCallback(atualizacao.callbackId, "Abra a conta com /start.");
    await enviarMensagem(atualizacao.chatId, RESPOSTA_SEM_CONTA);
    return;
  }
  if (acao.tipo === "escolher") {
    await limparPendenteUso(kv, atualizacao.chatId);
    await responderCallback(atualizacao.callbackId);
    await enviarTela(atualizacao, telaEscolher());
    return;
  }
  if (acao.tipo === "dialogo") {
    await aplicarModo(kv, atualizacao.chatId, "dialogo");
    await limparPendenteUso(kv, atualizacao.chatId);
    await responderCallback(atualizacao.callbackId);
    await enviarMensagem(atualizacao.chatId, "Atendimento com a Thialinha. Escreva o que precisa. Para voltar às operações, toque no botão.", {
      teclado: tecladoTrocarMenu(),
      editar: atualizacao.mensagemId,
    });
    return;
  }
  if (acao.tipo === "clube") {
    await aplicarModo(kv, atualizacao.chatId, "menu");
    await limparPendenteUso(kv, atualizacao.chatId);
    await responderCallback(atualizacao.callbackId);
    await abrirClube(kv, atualizacao.chatId);
    return;
  }
  if (acao.tipo === "cofrinho") {
    await aplicarModo(kv, atualizacao.chatId, "menu");
    await limparPendenteUso(kv, atualizacao.chatId);
    await responderCallback(atualizacao.callbackId);
    await abrirCofrinho(kv, atualizacao.chatId);
    return;
  }
  await aplicarModo(kv, atualizacao.chatId, "menu");
  const tela = await telaDaAcao(kv, atualizacao.chatId, acao, `u:${atualizacao.updateId}`);
  await responderCallback(atualizacao.callbackId);
  if (tela !== undefined) await enviarTela(atualizacao, tela);
}

export async function tratarTextoUso(
  kv: HostKvApi,
  chatId: string,
  texto: string,
  mensagemId: number,
  idempotencyKey: string,
): Promise<"menu" | "dialogo" | "escolha" | false> {
  if ((await lerConta(kv, chatId)) === undefined) return false;
  const pedido = interpretarPedidoUso(texto);
  if (pedido === "escolher" || comandoEscolher(texto)) {
    await limparPendenteUso(kv, chatId);
    await enviarEscolhaUso(chatId, mensagemId);
    return "escolha";
  }
  if (pedido === "menu" || comandoMenu(texto)) {
    await abrirMenu(kv, chatId, mensagemId);
    return "menu";
  }
  if (pedido === "dialogo" || comandoConversa(texto)) {
    await aplicarModo(kv, chatId, "dialogo");
    return "dialogo";
  }
  if ((await lerModoUso(kv, chatId)) === undefined) {
    await enviarEscolhaUso(chatId, mensagemId);
    return "escolha";
  }
  if ((await lerModoUso(kv, chatId)) !== "menu") return false;
  const pendente = await lerPendenteUso(kv, chatId);
  if (pendente !== undefined) {
    const tela = await seguirPendente(kv, chatId, texto, idempotencyKey);
    await enviarMensagem(chatId, tela.texto, { prefixo: false, teclado: tela.teclado, replyTo: mensagemId });
    return "menu";
  }
  const atalho = atalhoMenu(texto);
  if (atalho !== undefined) {
    if (atalho === "clube") {
      await abrirClube(kv, chatId, mensagemId);
      return "menu";
    }
    if (atalho === "cofrinho") {
      await abrirCofrinho(kv, chatId, mensagemId);
      return "menu";
    }
    const tela = await telaDaAcao(kv, chatId, { tipo: atalho }, idempotencyKey);
    if (tela !== undefined) {
      await enviarMensagem(chatId, tela.texto, { prefixo: false, teclado: tela.teclado, replyTo: mensagemId });
    }
    return "menu";
  }
  const home = await montarMenu(kv, chatId);
  await enviarMensagem(chatId, home?.texto ?? "LINHABANK\nConta indisponível.", {
    prefixo: false,
    teclado: home?.teclado,
    replyTo: mensagemId,
  });
  return "menu";
}

function atalhoMenu(texto: string): Exclude<AcaoUso["tipo"], "escolher" | "dialogo" | "confirmar" | "cancelar" | "cancelar_agenda"> | undefined {
  const limpo = texto.trim().toLowerCase();
  if (limpo === "/saldo" || limpo.startsWith("/saldo@") || limpo.startsWith("/saldo ")) return "saldo";
  if (limpo === "/extrato" || limpo.startsWith("/extrato@") || limpo.startsWith("/extrato ")) return "extrato";
  if (limpo === "/depositar" || limpo.startsWith("/depositar@") || limpo.startsWith("/depositar ")) return "receber";
  if (limpo === "/agendamentos" || limpo.startsWith("/agendamentos@") || limpo.startsWith("/agendamentos ")) return "agendamentos";
  if (limpo === "/ajuda" || limpo.startsWith("/ajuda@") || limpo.startsWith("/ajuda ")) return "ajuda";
  if (limpo === "/club" || limpo.startsWith("/club@") || limpo === "/clube" || limpo.startsWith("/clube@")) return "clube";
  if (limpo === "/cofrinho" || limpo.startsWith("/cofrinho@") || limpo === "/porquinho" || limpo.startsWith("/porquinho@")) {
    return "cofrinho";
  }
  if (limpo === "/start" || limpo.startsWith("/start@") || limpo.startsWith("/start ")) return "menu";
  return undefined;
}

async function telaDaAcao(kv: HostKvApi, chatId: string, acao: AcaoUso, idempotencyKey: string): Promise<TelaUso | undefined> {
  if (acao.tipo === "menu") return montarMenu(kv, chatId);
  if (acao.tipo === "saldo") return telaSaldo(kv, chatId);
  if (acao.tipo === "extrato") return telaExtrato(kv, chatId);
  if (acao.tipo === "ajuda") return telaAjudaMenu();
  if (acao.tipo === "agendamentos") return telaAgendamentos(kv, chatId);
  if (acao.tipo === "receber") return iniciarReceber(kv, chatId);
  if (acao.tipo === "enviar") return iniciarEnviar(kv, chatId);
  if (acao.tipo === "cancelar") {
    await limparPendenteUso(kv, chatId);
    return montarMenu(kv, chatId);
  }
  if (acao.tipo === "cancelar_agenda") return cancelarDoMenu(kv, chatId, acao.id);
  if (acao.tipo === "confirmar") return confirmarPix(kv, chatId, idempotencyKey);
  return montarMenu(kv, chatId);
}

async function seguirPendente(kv: HostKvApi, chatId: string, texto: string, idempotencyKey: string): Promise<TelaUso> {
  const pendente = await lerPendenteUso(kv, chatId);
  if (pendente === undefined) return (await montarMenu(kv, chatId)) ?? telaErro("Abra a conta com /start.");
  if (texto.trim().startsWith("/")) {
    await limparPendenteUso(kv, chatId);
    return (await montarMenu(kv, chatId)) ?? telaErro("Abra a conta com /start.");
  }
  if (pendente.etapa === "receber") return gerarDeposito(kv, chatId, texto, idempotencyKey);
  if (pendente.etapa === "chave") {
    const chave = texto.trim();
    if (chave.length < 3) return telaErro("Essa chave não deu certo.");
    await gravarPendenteUso(kv, chatId, { etapa: "valor", chave });
    return telaPedirValor("enviar");
  }
  if (pendente.etapa === "valor") return consultarEnvio(kv, chatId, pendente.chave, texto);
  return confirmarPix(kv, chatId, idempotencyKey);
}

async function gerarDeposito(kv: HostKvApi, chatId: string, texto: string, idempotencyKey: string): Promise<TelaUso> {
  const valor = reaisDoTexto(texto);
  if (valor === undefined) return telaPedirValor("receber");
  const deposito = await operarConta(kv, chatId, `${idempotencyKey}:dep`, { acao: "depositar", valor });
  const bloqueada = contaBloqueada(deposito.motivo, deposito.saldo);
  if (bloqueada !== undefined) {
    await limparPendenteUso(kv, chatId);
    return bloqueada;
  }
  if (!deposito.ok || deposito.copiaECola === undefined || deposito.valor === undefined) {
    await limparPendenteUso(kv, chatId);
    return telaErro(RESPOSTA_DEPOSITO_PENDENTE);
  }
  await limparPendenteUso(kv, chatId);
  const caption = textoDepositoMenu({
    valor: deposito.valor,
    taxa: deposito.taxa,
    liquido: deposito.liquido,
    copiaECola: deposito.copiaECola,
  });
  const png = await pngCopiaECola(deposito.copiaECola);
  const foto = await enviarFoto(chatId, png, caption, { prefixo: false });
  if (!foto) return { texto: caption, teclado: [[{ text: "Voltar", callback_data: "u:m" }]] };
  return (await montarMenu(kv, chatId)) ?? { texto: caption, teclado: [[{ text: "Voltar", callback_data: "u:m" }]] };
}

async function consultarEnvio(kv: HostKvApi, chatId: string, chave: string, texto: string): Promise<TelaUso> {
  const valor = reaisDoTexto(texto);
  if (valor === undefined) return telaPedirValor("enviar");
  const consulta = await operarConta(kv, chatId, `uso:${chatId}:consulta:${chave}:${valor}`, {
    acao: "consultar_chave",
    chavePix: chave,
    valor,
  });
  if (!consulta.ok) {
    const bloqueada = contaBloqueada(consulta.motivo, consulta.saldo);
    if (bloqueada !== undefined) {
      await limparPendenteUso(kv, chatId);
      return bloqueada;
    }
    if (consulta.motivo === "mesmo_cliente") return telaErro("Essa chave é da sua própria conta.");
    if (consulta.motivo === "saldo_insuficiente") return telaErro("Saldo insuficiente. O valor não saiu.");
    return telaErro("Essa chave não deu certo.");
  }
  const destino = consulta.destino ?? chave;
  await gravarPendenteUso(kv, chatId, {
    etapa: "confirmar",
    chave,
    valor,
    destino,
    ...(consulta.taxa !== undefined ? { taxa: consulta.taxa } : {}),
    ...(consulta.interno === true ? { interno: true } : {}),
  });
  return telaConfirmarPix({
    valor,
    destino,
    taxa: consulta.taxa,
    interno: consulta.interno,
  });
}

async function confirmarPix(kv: HostKvApi, chatId: string, idempotencyKey: string): Promise<TelaUso> {
  const pendente = await lerPendenteUso(kv, chatId);
  if (pendente?.etapa !== "confirmar") {
    await limparPendenteUso(kv, chatId);
    return (await montarMenu(kv, chatId)) ?? telaErro("Confirme o PIX pelo menu.");
  }
  const enviado = await operarConta(kv, chatId, `${idempotencyKey}:pix`, {
    acao: "enviar_pix",
    chavePix: pendente.chave,
    valor: pendente.valor,
  });
  const bloqueada = contaBloqueada(enviado.motivo, enviado.saldo);
  if (bloqueada !== undefined) {
    await limparPendenteUso(kv, chatId);
    return bloqueada;
  }
  if (!enviado.ok) {
    await limparPendenteUso(kv, chatId);
    if (enviado.motivo === "saldo_insuficiente") return telaErro("Saldo insuficiente. O valor não saiu.");
    return telaErro(RESPOSTA_PIX_INDISPONIVEL);
  }
  await limparPendenteUso(kv, chatId);
  if (enviado.avisoDestino !== undefined) {
    await enviarMensagem(enviado.avisoDestino.chatId, enviado.avisoDestino.texto);
  }
  return telaPixEnviado({
    valor: enviado.valor ?? pendente.valor,
    destino: enviado.destino ?? pendente.destino,
    saldo: enviado.saldo ?? "0,00",
    comprovante: enviado.comprovante ?? enviado.endToEndId,
    taxa: enviado.taxa ?? pendente.taxa,
    interno: enviado.interno ?? pendente.interno,
  });
}

function reaisDoTexto(texto: string): string | undefined {
  const centavos = centavosDe(texto.replace(/^r\$\s*/i, "").trim());
  if (centavos === undefined) return undefined;
  return reaisDe(centavos);
}

async function enviarTela(atualizacao: Callback, tela: TelaUso): Promise<void> {
  const editado = await enviarMensagem(atualizacao.chatId, tela.texto, {
    prefixo: false,
    teclado: tela.teclado,
    editar: atualizacao.mensagemId,
  });
  if (!editado.ok) {
    await enviarMensagem(atualizacao.chatId, tela.texto, { prefixo: false, teclado: tela.teclado });
  }
}
