import { dataHoraBrasil } from "./horario.js";

export const RESPOSTA_AJUDA =
  "Sua conta LinhaBank está ativa. Posso consultar saldo e extrato, receber depósito no PIX, enviar PIX, agendar PIX, transferir entre contas LinhaBank, pagar boleto ou bloquear o cartão virtual. O que você precisa?";

export type ItemExtrato = {
  em: string;
  tipo: string;
  valor: string;
  descricao: string;
  comprovante?: string;
};

const ROTULO_TIPO: Record<string, string> = {
  pix_enviado: "PIX enviado",
  pix_recebido: "PIX recebido",
  deposito: "depósito",
  boleto: "boleto",
  transferencia_enviada: "transferência enviada",
  transferencia_recebida: "transferência recebida",
  taxa: "taxa",
  estorno: "estorno",
};

export function movimentosDoDia(itens: ItemExtrato[], agora = new Date()): ItemExtrato[] {
  const hoje = dataHoraBrasil(agora).data;
  return itens
    .filter((item) => {
      const instante = Date.parse(item.em);
      if (!Number.isFinite(instante)) return false;
      return dataHoraBrasil(new Date(instante)).data === hoje;
    })
    .sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
}

export function respostaStartComConta(dados: {
  nome?: string;
  saldo: string;
  movimentos: ItemExtrato[];
}): string {
  const pedaco = (dados.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const nome = pedaco.length >= 2 && pedaco.toLowerCase() !== "cliente" ? pedaco.slice(0, 24) : undefined;
  const oi = nome === undefined ? "Oii!" : `Oii, ${nome}!`;
  if (dados.movimentos.length === 0) {
    return `${oi} Seu saldo é R$ ${dados.saldo}. Hoje ainda não teve movimentação. O que você precisa?`;
  }
  const limite = dados.movimentos.slice(-8);
  const linhas = limite.map((item) => {
    const hora = Number.isFinite(Date.parse(item.em)) ? dataHoraBrasil(new Date(item.em)).hora : "";
    const tipo = ROTULO_TIPO[item.tipo] ?? item.tipo;
    const horaTxt = hora.length > 0 ? `${hora} ` : "";
    return `${horaTxt}${tipo} R$ ${item.valor}`;
  });
  const extra =
    dados.movimentos.length > limite.length
      ? `\n…e mais ${dados.movimentos.length - limite.length} neste dia.`
      : "";
  return `${oi} Seu saldo é R$ ${dados.saldo}.\n\nMovimentação de hoje:\n${linhas.join("\n")}${extra}\n\nO que você precisa?`;
}

export const RESPOSTA_SEM_CONTA =
  "A conta ainda não está aberta. Envie /start e responda CONCORDO para concluir a abertura. Deseja que eu explique os termos?";

export const RESPOSTA_PIX_INDISPONIVEL =
  "O PIX não foi enviado. O saldo permanece o mesmo. Deseja tentar novamente?";

export const RESPOSTA_DESTINO_INTERNO =
  "O destino informado é uma conta LinhaBank. Nesse caso, a operação correta é uma transferência. Deseja continuar?";

export const RESPOSTA_SEGREDO =
  "Não envie senha, código ou dados do cartão neste atendimento. Não repita esse dado aqui.";

export const RESPOSTA_COMPROVANTE =
  "Foto ou arquivo de comprovante não credita saldo. O valor só entra quando o pagamento é confirmado. Quer gerar um QR Code para depositar?";

export const RESPOSTA_DEPOSITO_PENDENTE =
  "Ainda não consigo gerar o PIX de depósito. O saldo permanece o mesmo. Deseja tentar de novo mais tarde?";

export function respostaContaAberta(dados: {
  agencia: string;
  numero: string;
  chave: string;
  saldo: string;
}): string {
  return `Sua conta LinhaBank está aberta. Agência ${dados.agencia}, conta ${dados.numero}, chave de transferência ${dados.chave}. Saldo: R$ ${dados.saldo}. Posso consultar o extrato, enviar um PIX ou fazer uma transferência?`;
}

export function respostaSaldo(saldo: string): string {
  return `O saldo da sua conta é R$ ${saldo}. Deseja ver o extrato?`;
}

export function respostaPixEnviado(dados: {
  valor: string;
  destino: string;
  saldo: string;
  comprovante?: string;
  taxa?: string;
  interno?: boolean;
}): string {
  if (dados.interno) {
    return `PIX de R$ ${dados.valor} enviado para a conta LinhaBank ${dados.destino}. Sem taxa. Saldo: R$ ${dados.saldo}.`;
  }
  const comprovante = dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : ` Comprovante ${dados.comprovante}.`;
  const taxa = dados.taxa === undefined || dados.taxa === "0,00" ? " Sem taxa." : ` Taxa: R$ ${dados.taxa}.`;
  return `PIX de R$ ${dados.valor} enviado para ${dados.destino}.${comprovante}${taxa} Saldo: R$ ${dados.saldo}.`;
}

export function respostaTransferencia(dados: { valor: string; destino: string; saldo: string }): string {
  return `Transferência de R$ ${dados.valor} realizada para a conta ${dados.destino}. Saldo: R$ ${dados.saldo}.`;
}

export function respostaBoleto(dados: { valor: string; descricao: string; saldo: string }): string {
  return `Pagamento de R$ ${dados.valor} registrado: ${dados.descricao}. Saldo: R$ ${dados.saldo}.`;
}

export function respostaPixRecebido(dados: {
  valor: string;
  saldo: string;
  comprovante?: string;
  origem?: string;
  taxa?: string;
}): string {
  const comprovante = dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : ` Comprovante ${dados.comprovante}.`;
  if (dados.origem !== undefined && dados.origem.length > 0) {
    return `PIX de R$ ${dados.valor} recebido da conta LinhaBank ${dados.origem}. Saldo: R$ ${dados.saldo}.`;
  }
  const taxa = dados.taxa === undefined || dados.taxa === "0,00" ? "" : ` Taxa: R$ ${dados.taxa}.`;
  return `PIX de R$ ${dados.valor} recebido na sua conta.${taxa} Saldo: R$ ${dados.saldo}.${comprovante}`;
}

export function respostaAgendamentoCriado(dados: {
  id: string;
  valor: string;
  destino: string;
  repeticao: string;
  quando: string;
}): string {
  const continuidade =
    dados.repeticao === "uma vez"
      ? "O envio será automático nesse horário, salvo cancelamento."
      : "O envio será automático até o cancelamento.";
  return `PIX de R$ ${dados.valor} para ${dados.destino} agendado: ${dados.repeticao}, próximo envio em ${dados.quando}. ${continuidade} Código ${dados.id}.`;
}

export function respostaAgendamentoCancelado(dados: { id: string; valor: string; destino: string }): string {
  return `Agendamento ${dados.id} cancelado. O PIX de R$ ${dados.valor} para ${dados.destino} não será mais enviado.`;
}

export function respostaListaAgendamentos(
  itens: { id: string; valor: string; destino: string; repeticao: string; quando: string }[],
): string {
  if (itens.length === 0) return "Você não tem PIX agendado. Quer agendar um envio?";
  const linhas = itens.map(
    (item) => `${item.id}: R$ ${item.valor} para ${item.destino}, ${item.repeticao}, próximo em ${item.quando}.`,
  );
  return `PIX agendados: ${linhas.join(" ")} Para cancelar, informe o código.`;
}

export function respostaPixAgendadoEnviado(dados: {
  valor: string;
  destino: string;
  saldo: string;
  comprovante?: string;
  proximo?: string;
  aposCancelamento?: boolean;
  taxa?: string;
  interno?: boolean;
}): string {
  const comprovante = dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : ` Comprovante ${dados.comprovante}.`;
  const taxa = dados.interno || dados.taxa === undefined || dados.taxa === "0,00" ? " Sem taxa." : ` Taxa: R$ ${dados.taxa}.`;
  if (dados.aposCancelamento) {
    return `O PIX agendado de R$ ${dados.valor} para ${dados.destino} foi enviado porque o envio já tinha começado. Não haverá próximo envio.${comprovante}${taxa} Saldo: R$ ${dados.saldo}.`;
  }
  const proximo = dados.proximo === undefined ? "" : ` O próximo envio está marcado para ${dados.proximo}.`;
  return `PIX agendado de R$ ${dados.valor} enviado para ${dados.destino}.${comprovante}${taxa} Saldo: R$ ${dados.saldo}.${proximo}`;
}

export function respostaPixAgendadoNaoEnviado(dados: {
  valor: string;
  destino: string;
  proximo?: string;
  encerrado?: boolean;
}): string {
  if (dados.encerrado) {
    return `O PIX agendado de R$ ${dados.valor} para ${dados.destino} não foi enviado. O saldo permanece o mesmo. O agendamento foi encerrado.`;
  }
  if (dados.proximo !== undefined) {
    return `O PIX agendado de R$ ${dados.valor} para ${dados.destino} não foi enviado. O saldo permanece o mesmo. O próximo envio está marcado para ${dados.proximo}.`;
  }
  return `O PIX agendado de R$ ${dados.valor} para ${dados.destino} não foi enviado. O saldo permanece o mesmo. O envio continua agendado.`;
}
