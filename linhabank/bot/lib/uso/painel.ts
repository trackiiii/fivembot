import type { HostKvApi } from "@grok/agent-sdk";

import { cancelarAgendamento, listarAgendamentos } from "../agenda.js";
import { lerConta, operarConta, reaisDe } from "../banco.js";
import { totalGuardadoConta } from "../cofrinho/servico.js";
import { formatarQuando } from "../horario.js";
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
      "Canal de atendimento",
      "",
      "Como deseja operar a conta neste chat?",
      "",
      "Menu de operações: saldo, PIX, cofrinho e Club por botões.",
      "Atendimento Thialinha — você escreve, ela responde.",
      "",
      "A escolha pode ser alterada a qualquer momento.",
    ].join("\n"),
    teclado: [
      [{ text: "Menu de operações", callback_data: "u:m" }],
      [{ text: "Atendimento Thialinha", callback_data: "u:d" }],
    ],
  };
}

export function tecladoTrocarMenu(): BotaoUso[][] {
  return [[{ text: "Menu de operações", callback_data: "u:m" }]];
}

export async function montarMenu(kv: HostKvApi, chatId: string): Promise<TelaUso | undefined> {
  const conta = await lerConta(kv, chatId);
  if (conta === undefined) return undefined;
  const resumo = await operarConta(kv, chatId, `uso:${chatId}:home`, { acao: "resumo" });
  const guardado = await totalGuardadoConta(kv, chatId);
  const perfil = resumo.conta;
  return {
    texto: [
      "LINHABANK",
      "Conta",
      "",
      `Agência ${perfil?.agencia ?? conta.agencia}  ·  Conta ${perfil?.numero ?? conta.numero}`,
      `Chave ${perfil?.chaveTransferencia ?? conta.chaveInterna}`,
      "",
      `Disponível: R$ ${resumo.saldo ?? reaisDe(conta.saldoCentavos)}`,
      `Cofrinho: R$ ${reaisDe(guardado)}`,
    ].join("\n"),
    teclado: [
      [
        { text: "Saldo", callback_data: "u:s" },
        { text: "Extrato", callback_data: "u:x" },
      ],
      [{ text: "Receber PIX", callback_data: "u:r" }],
      [{ text: "Enviar PIX", callback_data: "u:p" }],
      [{ text: "PIX agendados", callback_data: "u:a" }],
      [{ text: "Cofrinho", callback_data: "u:k" }],
      [{ text: "LINHABANK CLUB", callback_data: "u:b" }],
      [{ text: "Atendimento Thialinha", callback_data: "u:d" }],
    ],
  };
}

export async function telaSaldo(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  const resumo = await operarConta(kv, chatId, `uso:${chatId}:saldo`, { acao: "resumo" });
  const guardado = await totalGuardadoConta(kv, chatId);
  const disponivel = resumo.saldo ?? "0,00";
  return {
    texto: [
      "LINHABANK",
      "Saldo da conta",
      "",
      `Disponível: R$ ${disponivel}`,
      `Cofrinho: R$ ${reaisDe(guardado)}`,
      "",
      "PIX e boleto usam apenas o disponível.",
    ].join("\n"),
    teclado: [
      [{ text: "Extrato", callback_data: "u:x" }],
      [{ text: "Receber PIX", callback_data: "u:r" }],
      [{ text: "Enviar PIX", callback_data: "u:p" }],
      ...voltar(),
    ],
  };
}

export async function telaExtrato(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  const lista = await operarConta(kv, chatId, `uso:${chatId}:extrato`, { acao: "extrato" });
  const itens = lista.extrato ?? [];
  const linhas =
    itens.length === 0
      ? ["Sem movimentação."]
      : itens.slice(0, 12).map((item) => {
          const tipo = ROTULO_TIPO[item.tipo] ?? item.tipo;
          const quando = Number.isFinite(Date.parse(item.em)) ? formatarQuando(item.em) : item.em;
          const extra = item.comprovante !== undefined && item.comprovante.length > 0 ? `  ${item.comprovante}` : "";
          return `${quando}  ${tipo}  R$ ${item.valor}${extra}`;
        });
  return {
    texto: ["LINHABANK", "Extrato", "", `Disponível: R$ ${lista.saldo ?? "0,00"}`, "", ...linhas].join("\n"),
    teclado: voltar(),
  };
}

export function telaPedirValor(acao: "receber" | "enviar"): TelaUso {
  return {
    texto:
      acao === "receber"
        ? "Informe o valor a receber, em reais. Exemplo: 50 ou 10,50."
        : "Informe o valor a enviar, em reais.",
    teclado: [[{ text: "Cancelar", callback_data: "u:z" }]],
  };
}

export function telaPedirChave(): TelaUso {
  return {
    texto: "Informe a chave PIX de destino.",
    teclado: [[{ text: "Cancelar", callback_data: "u:z" }]],
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
      ? "Tarifa: isento (conta LinhaBank)"
      : dados.taxa === undefined || dados.taxa === "0,00"
        ? "Tarifa: isento neste momento"
        : `Tarifa: R$ ${dados.taxa}`;
  return {
    texto: [
      "LINHABANK",
      "Confirmação de PIX",
      "",
      `Valor: R$ ${dados.valor}`,
      `Destino: ${dados.destino}`,
      taxa,
    ].join("\n"),
    teclado: [[{ text: "Confirmar envio", callback_data: "u:y" }], [{ text: "Cancelar", callback_data: "u:z" }]],
  };
}

export function telaAjudaMenu(): TelaUso {
  return {
    texto: [
      "LINHABANK",
      "Operações",
      "",
      "Este canal opera por botões.",
      "Receber PIX gera o QR. Enviar PIX pede chave, valor e confirmação.",
      "O cofrinho separa valor do disponível, sem tarifa e sem rendimento.",
      "LBcoins do Club não são saldo em real.",
    ].join("\n"),
    teclado: [[{ text: "Atendimento Thialinha", callback_data: "u:d" }], ...voltar()],
  };
}

export async function telaAgendamentos(kv: HostKvApi, chatId: string): Promise<TelaUso> {
  const lista = await listarAgendamentos(kv, chatId);
  const itens = lista.agendamentos;
  const corpo =
    itens.length === 0
      ? ["Nenhum agendamento ativo.", "Para programar um envio, use o atendimento Thialinha."]
      : itens.map((item) => `${item.id}  R$ ${item.valor}  ${item.destino}  ${item.repeticao}  próximo ${item.quando}`);
  return {
    texto: ["LINHABANK", "PIX agendados", "", ...corpo].join("\n"),
    teclado: [
      ...itens.map((item) => [{ text: `Cancelar ${item.id}`, callback_data: `u:q:${item.id.toLowerCase().replace(/^ag-/, "ag")}` }]),
      ...(itens.length === 0 ? [[{ text: "Atendimento Thialinha", callback_data: "u:d" }]] : []),
      ...voltar(),
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
    dados.interno === true || dados.taxa === undefined || dados.taxa === "0,00" ? "Tarifa: isento" : `Tarifa: R$ ${dados.taxa}`;
  const comprovante =
    dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : `\nComprovante ${dados.comprovante}.`;
  return {
    texto: [
      "LINHABANK",
      "PIX enviado",
      "",
      `Valor: R$ ${dados.valor}`,
      `Destino: ${dados.destino}`,
      taxa,
      `Disponível: R$ ${dados.saldo}.${comprovante}`,
    ].join("\n"),
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
  return ["LINHABANK", "Depósito PIX", "", `Pague R$ ${dados.valor}. ${inclusa}`, "", "Copia e cola:", dados.copiaECola].join("\n");
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
  return (await lerModoUso(kv, chatId)) === "menu" ? [[{ text: "Menu da conta", callback_data: "u:m" }]] : [];
}

function voltar(): BotaoUso[][] {
  return [[{ text: "Voltar", callback_data: "u:m" }]];
}
