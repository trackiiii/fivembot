import type { HostKvApi } from "@grok/agent-sdk";

import { cancelarAgendamento, listarAgendamentos } from "../agenda.js";
import { lerConta, operarConta, reaisDe } from "../banco.js";
import { totalGuardadoConta } from "../cofrinho/servico.js";
import { RESPOSTA_CONTA_DESATIVADA } from "../respostas.js";
import { gravarModoUso, gravarPendenteUso, lerModoUso } from "./store.js";
import type { BotaoUso, ModoUso, TelaUso } from "./tipos.js";

export type AcaoUso =
  | { tipo: "escolher" }
  | { tipo: "dialogo" }
  | { tipo: "menu" }
  | { tipo: "saldo" }
  | { tipo: "extrato" }
  | { tipo: "receber" }
  | { tipo: "enviar" }
  | { tipo: "cofrinho" }
  | { tipo: "clube" }
  | { tipo: "agendamentos" }
  | { tipo: "ajuda" }
  | { tipo: "confirmar" }
  | { tipo: "cancelar" }
  | { tipo: "cancelar_agenda"; id: string };

const ROTULO_TIPO: Record<string, string> = {
  pix_enviado: "PIX enviado",
  pix_recebido: "PIX recebido",
  deposito: "depósito",
  boleto: "boleto",
  transferencia_enviada: "transferência enviada",
  transferencia_recebida: "transferência recebida",
  taxa: "taxa",
  estorno: "estorno",
  cofrinho_guardar: "guardado no cofrinho",
  cofrinho_resgatar: "resgate do cofrinho",
};

export function parseAcaoUso(dados: string): AcaoUso | undefined {
  if (dados === "u:e") return { tipo: "escolher" };
  if (dados === "u:d") return { tipo: "dialogo" };
  if (dados === "u:m") return { tipo: "menu" };
  if (dados === "u:s") return { tipo: "saldo" };
  if (dados === "u:x") return { tipo: "extrato" };
  if (dados === "u:r") return { tipo: "receber" };
  if (dados === "u:p") return { tipo: "enviar" };
  if (dados === "u:k") return { tipo: "cofrinho" };
  if (dados === "u:b") return { tipo: "clube" };
  if (dados === "u:a") return { tipo: "agendamentos" };
  if (dados === "u:h") return { tipo: "ajuda" };
  if (dados === "u:y") return { tipo: "confirmar" };
  if (dados === "u:z") return { tipo: "cancelar" };
  const agenda = dados.match(/^u:q:(ag[a-f0-9]{8})$/);
  if (agenda?.[1] !== undefined) return { tipo: "cancelar_agenda", id: agenda[1] };
  return undefined;
}

export function comandoMenu(texto: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return limpo === "/menu" || limpo.startsWith("/menu@") || limpo.startsWith("/menu ");
}

export function comandoConversa(texto: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return (
    limpo === "/conversa" ||
    limpo.startsWith("/conversa@") ||
    limpo.startsWith("/conversa ") ||
    limpo === "/thialinha" ||
    limpo.startsWith("/thialinha@")
  );
}

export function comandoEscolher(texto: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return limpo === "/modo" || limpo.startsWith("/modo@") || limpo.startsWith("/modo ");
}

export function interpretarPedidoUso(texto: string): "menu" | "dialogo" | "escolher" | undefined {
  const t = texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (comandoMenu(texto) || /\b(quero o menu|abrir o menu|usar o menu|prefiro (os )?botoes|prefiro clicar|quero clicar)\b/.test(t)) {
    return "menu";
  }
  if (
    comandoConversa(texto) ||
    /\b(falar com a thialinha|prefiro (a )?conversa|prefiro conversar|quero conversar|quero (a )?thialinha)\b/.test(t)
  ) {
    return "dialogo";
  }
  if (comandoEscolher(texto) || /\b(trocar (o )?modo|mudar (o )?atendimento|escolher (de )?novo)\b/.test(t)) {
    return "escolher";
  }
  return undefined;
}

export function telaEscolher(): TelaUso {
  return {
    texto: [
      "LINHABANK",
      "",
      "Como você prefere usar?",
      "",
      "Falar com a Thialinha — você escreve, ela responde.",
      "Menu — você toca nos botões.",
      "",
      "Dá para trocar depois em /menu ou /conversa.",
    ].join("\n"),
    teclado: [[{ text: "Falar com a Thialinha", callback_data: "u:d" }], [{ text: "Usar o menu", callback_data: "u:m" }]],
  };
}

export function tecladoTrocarMenu(): BotaoUso[][] {
  return [[{ text: "Usar o menu", callback_data: "u:m" }]];
}

export async function montarMenu(kv: HostKvApi, chatId: string): Promise<TelaUso | undefined> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return undefined;
  const resumo = await operarConta(kv, chatId, `uso:${chatId}:home`, { acao: "resumo" });
  const guardado = await totalGuardadoConta(kv, chatId);
  const linhas = [
    "LINHABANK",
    "",
    "Toque no que você precisa.",
    "",
    `Disponível: R$ ${resumo.saldo ?? reaisDe(conta.saldoCentavos)}`,
  ];
  if (guardado > 0) linhas.push(`No cofrinho: R$ ${reaisDe(guardado)}`);
  return {
    texto: linhas.join("\n"),
    teclado: [
      [{ text: "Saldo", callback_data: "u:s" }],
      [{ text: "Extrato", callback_data: "u:x" }],
      [{ text: "Receber PIX", callback_data: "u:r" }],
      [{ text: "Enviar PIX", callback_data: "u:p" }],
      [{ text: "Cofrinho", callback_data: "u:k" }],
      [{ text: "Club", callback_data: "u:b" }],
      [{ text: "Agendamentos", callback_data: "u:a" }],
      [{ text: "Ajuda", callback_data: "u:h" }],
      [{ text: "Falar com a Thialinha", callback_data: "u:d" }],
    ],
  };
}

export async function telaSaldo(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  const resumo = await operarConta(kv, chatId, `uso:${chatId}:saldo`, { acao: "resumo" });
  const guardado = await totalGuardadoConta(kv, chatId);
  const linhas = ["Saldo", "", `Disponível: R$ ${resumo.saldo ?? "0,00"}`];
  if (guardado > 0) linhas.push(`No cofrinho: R$ ${reaisDe(guardado)}`, "O PIX usa só o disponível.");
  return { texto: linhas.join("\n"), teclado: voltar() };
}

export async function telaExtrato(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  const lista = await operarConta(kv, chatId, `uso:${chatId}:extrato`, { acao: "extrato" });
  const itens = lista.extrato ?? [];
  const linhas =
    itens.length === 0
      ? ["Ainda não há movimentação."]
      : itens.slice(0, 12).map((item) => {
          const tipo = ROTULO_TIPO[item.tipo] ?? item.tipo;
          const extra = item.comprovante !== undefined && item.comprovante.length > 0 ? ` · ${item.comprovante}` : "";
          return `${item.em}  ${tipo}  R$ ${item.valor}${extra}`;
        });
  return {
    texto: [`Extrato`, "", `Saldo: R$ ${lista.saldo ?? "0,00"}`, "", ...linhas].join("\n"),
    teclado: voltar(),
  };
}

export function telaPedirValor(acao: "receber" | "enviar"): TelaUso {
  return {
    texto: acao === "receber" ? "Qual valor receber? Manda em reais, tipo 50 ou 10,50." : "Qual valor enviar?",
    teclado: [[{ text: "Voltar", callback_data: "u:z" }]],
  };
}

export function telaPedirChave(): TelaUso {
  return {
    texto: "Qual a chave PIX de destino?",
    teclado: [[{ text: "Voltar", callback_data: "u:z" }]],
  };
}

export function telaConfirmarPix(dados: {
  valor: string;
  destino: string;
  taxa?: string;
  interno?: boolean;
}): TelaUso {
  const taxa =
    dados.interno === true
      ? "Conta LinhaBank. Sem taxa."
      : dados.taxa === undefined || dados.taxa === "0,00"
        ? "PIX para fora. Sem taxa neste momento."
        : `PIX para fora. Taxa R$ ${dados.taxa}.`;
  return {
    texto: [`Confirme o PIX`, "", `Valor: R$ ${dados.valor}`, `Destino: ${dados.destino}`, taxa].join("\n"),
    teclado: [[{ text: "Confirmar", callback_data: "u:y" }], [{ text: "Voltar", callback_data: "u:z" }]],
  };
}

export function telaAjudaMenu(): TelaUso {
  return {
    texto: [
      "LINHABANK",
      "",
      "Neste modo você opera tocando nos botões.",
      "Saldo e extrato vêm da conta. PIX de envio pede confirmação. Cofrinho e Club abrem a tela deles.",
      "",
      "Para conversar, toque em Falar com a Thialinha.",
      "Para voltar a escolher: /modo",
    ].join("\n"),
    teclado: voltar(),
  };
}

export async function telaAgendamentos(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  const lista = await listarAgendamentos(kv, chatId);
  const itens = lista.agendamentos;
  const corpo =
    itens.length === 0
      ? ["Nenhum PIX agendado.", "Para marcar um envio automático, fale com a Thialinha."]
      : itens.map((item) => `${item.id}: R$ ${item.valor} para ${item.destino}, ${item.repeticao}, próximo em ${item.quando}.`);
  return {
    texto: ["PIX agendados", "", ...corpo].join("\n"),
    teclado: [
      ...itens.map((item) => [{ text: `Cancelar ${item.id}`, callback_data: `u:q:${item.id.toLowerCase().replace(/^ag-/, "ag")}` }]),
      [{ text: "Falar com a Thialinha", callback_data: "u:d" }],
      [{ text: "Voltar", callback_data: "u:m" }],
    ],
  };
}

export async function cancelarDoMenu(kv: HostKvApi, chatId: string, id: string): Promise<TelaUso> {
  const codigo = id.startsWith("ag") ? `AG-${id.slice(2).toUpperCase()}` : id;
  const resultado = await cancelarAgendamento(kv, chatId, codigo);
  const lista = await telaAgendamentos(kv, chatId);
  return { texto: `${resultado.texto}\n\n${lista.texto}`, teclado: lista.teclado };
}

export function telaPixEnviado(dados: {
  valor: string;
  destino: string;
  saldo: string;
  comprovante?: string;
  taxa?: string;
  interno?: boolean;
}): TelaUso {
  const taxa =
    dados.interno === true || dados.taxa === undefined || dados.taxa === "0,00" ? "Sem taxa." : `Taxa R$ ${dados.taxa}.`;
  const comprovante =
    dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : `\nComprovante ${dados.comprovante}.`;
  return {
    texto: `PIX de R$ ${dados.valor} enviado para ${dados.destino}. ${taxa} Saldo agora: R$ ${dados.saldo}.${comprovante}`,
    teclado: voltar(),
  };
}

export function telaErro(texto: string): TelaUso {
  return { texto, teclado: voltar() };
}

export function textoDepositoMenu(dados: { valor: string; taxa?: string; liquido?: string; copiaECola: string }): string {
  const inclusa =
    dados.taxa !== undefined && dados.taxa !== "0,00"
      ? `Taxa R$ ${dados.taxa} já inclusa. Entram R$ ${dados.liquido ?? dados.valor} na conta.`
      : "O saldo só entra depois da confirmação.";
  return [`PIX para depósito`, "", `Pague R$ ${dados.valor}. ${inclusa}`, "", "Copia e cola:", dados.copiaECola].join("\n");
}

export async function aplicarModo(kv: HostKvApi, chatId: string, modo: ModoUso): Promise<void> {
  await gravarModoUso(kv, chatId, modo);
}

export async function iniciarReceber(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  await gravarPendenteUso(kv, chatId, { etapa: "receber" });
  return telaPedirValor("receber");
}

export async function iniciarEnviar(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  await gravarPendenteUso(kv, chatId, { etapa: "chave" });
  return telaPedirChave();
}

export function contaBloqueada(motivo: string | undefined, saldo?: string): TelaUso | undefined {
  if (motivo !== "conta_bloqueada") return undefined;
  return telaErro(saldo === undefined ? RESPOSTA_CONTA_DESATIVADA : `${RESPOSTA_CONTA_DESATIVADA} Saldo: R$ ${saldo}.`);
}

export async function voltarMenuSePrecisar(kv: HostKvApi, chatId: string): Promise<BotaoUso[][]> {
  return (await lerModoUso(kv, chatId)) === "menu" ? [[{ text: "Voltar ao menu", callback_data: "u:m" }]] : [];
}

function voltar(): BotaoUso[][] {
  return [[{ text: "Voltar", callback_data: "u:m" }]];
}
