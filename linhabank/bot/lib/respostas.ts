import { dataHoraBrasil } from "./horario.js";

export const RESPOSTA_AJUDA =
  "Tô aqui. Posso ver o saldo, gerar um PIX pra receber, mandar um, guardar no cofrinho, agendar um envio ou abrir o Club. Me fala o que você precisa. Se preferir clicar, manda /menu.";

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
  cofrinho_guardar: "guardado no cofrinho",
  cofrinho_resgatar: "resgate do cofrinho",
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
  const oi = nome === undefined ? "Oi. Tô aqui." : `Oi, ${nome}. Tô aqui.`;
  if (dados.movimentos.length === 0) {
    return `${oi} Seu saldo é R$ ${dados.saldo}. Hoje ainda não teve movimentação. Quer mandar um PIX ou era só conferir?`;
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
  return `${oi} Seu saldo é R$ ${dados.saldo}.\n\nMovimentação de hoje:\n${linhas.join("\n")}${extra}\n\nQuer mandar um PIX, receber, ou era só conferir?`;
}

export const RESPOSTA_SEM_CONTA =
  "A conta ainda não está aberta neste chat. Manda /start, lê com calma e responde CONCORDO. Aí eu abro a carteira e a gente começa. Quer que eu explique os termos?";

export const RESPOSTA_PIX_INDISPONIVEL =
  "O PIX não saiu. O saldo permanece o mesmo, relaxa. Quer tentar de novo agora?";

export const RESPOSTA_CONTA_DESATIVADA =
  "Sua conta está desativada. PIX e depósitos ficam parados até a gerência reativar.";

export const RESPOSTA_MANUTENCAO = [
  "🔧 LINHABANK | MANUTENÇÃO PROGRAMADA",
  "",
  "Olá! 👋",
  "",
  "Estamos realizando uma manutenção em nossos sistemas para trazer melhorias, mais estabilidade e uma experiência ainda melhor para você.",
  "",
  "💙 Durante esse período, alguns serviços da LINHABANK poderão ficar temporariamente indisponíveis.",
  "",
  "🚀 Nossa equipe está trabalhando para restabelecer tudo o mais rápido possível.",
  "",
  "Agradecemos pela compreensão e pela confiança!",
  "",
  "LINHABANK",
  "Sua vida financeira, ainda mais simples.",
].join("\n");

export const RESPOSTA_DESTINO_INTERNO =
  "Essa chave é de uma conta LinhaBank. Nesse caso o PIX vai direto, sem taxa. Quer continuar?";

export const RESPOSTA_SEGREDO =
  "Não manda senha, código nem dado de cartão neste chat, tá? Eu não peço isso. Não repete esse dado aqui.";

export const RESPOSTA_COMPROVANTE =
  "Eu vi o comprovante, mas foto não coloca dinheiro na conta. O valor só entra quando o pagamento confirma. Quer que eu gere um QR pra depositar?";

export const RESPOSTA_DEPOSITO_PENDENTE =
  "Não consegui gerar o PIX de depósito agora. O saldo permanece o mesmo. A gente tenta de novo daqui a pouco?";

export function respostaContaAberta(dados: {
  agencia: string;
  numero: string;
  chave: string;
  saldo: string;
}): string {
  return `Conta aberta.\n\nAgência ${dados.agencia}\nConta ${dados.numero}\nChave ${dados.chave}\n\nSaldo: R$ ${dados.saldo}. Quer receber um PIX pra começar?`;
}

export function respostaSaldo(saldo: string): string {
  return `Seu saldo é R$ ${saldo}. Era só conferir, ou a gente manda um PIX?`;
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
    return `PIX de R$ ${dados.valor} enviado para a conta LinhaBank ${dados.destino}. Sem taxa. Saldo agora: R$ ${dados.saldo}. Quer mandar outro?`;
  }
  const comprovante = dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : ` Comprovante ${dados.comprovante}.`;
  const taxa = dados.taxa === undefined || dados.taxa === "0,00" ? " Sem taxa." : ` Taxa: R$ ${dados.taxa}.`;
  return `PIX de R$ ${dados.valor} enviado para ${dados.destino}.${comprovante}${taxa} Saldo agora: R$ ${dados.saldo}.`;
}

export function respostaTransferencia(dados: { valor: string; destino: string; saldo: string }): string {
  return `Transferência de R$ ${dados.valor} feita para a conta ${dados.destino}. Saldo agora: R$ ${dados.saldo}. Precisa de mais alguma coisa?`;
}

export function respostaBoleto(dados: { valor: string; descricao: string; saldo: string }): string {
  return `Paguei o boleto de R$ ${dados.valor}: ${dados.descricao}. Saldo agora: R$ ${dados.saldo}.`;
}

export function textoDepositoPix(dados: { valor: string; taxa?: string; liquido?: string; copiaECola: string }): string {
  const inclusa =
    dados.taxa !== undefined && dados.taxa !== "0,00"
      ? ` Taxa R$ ${dados.taxa} já inclusa. Entram R$ ${dados.liquido ?? dados.valor} na conta.`
      : " O saldo só entra depois da confirmação.";
  return `Fiz o PIX pra você pagar. São R$ ${dados.valor}.${inclusa}\n\nCopia e cola:\n${dados.copiaECola}\n\nQuando cair, eu te aviso. Não precisa me mandar print.`;
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
    return `Caiu um PIX de R$ ${dados.valor} da conta LinhaBank ${dados.origem}. Saldo agora: R$ ${dados.saldo}.`;
  }
  const taxa = dados.taxa === undefined || dados.taxa === "0,00" ? "" : ` Taxa: R$ ${dados.taxa}.`;
  return `Caiu um PIX de R$ ${dados.valor} na sua conta.${taxa} Saldo agora: R$ ${dados.saldo}.${comprovante}`;
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
  return `Agendei. PIX de R$ ${dados.valor} para ${dados.destino}, ${dados.repeticao}, próximo envio em ${dados.quando}. ${continuidade} Código ${dados.id}. Guarda esse código se quiser cancelar.`;
}

export function respostaAgendamentoCancelado(dados: { id: string; valor: string; destino: string }): string {
  return `Cancelei o ${dados.id}. O PIX de R$ ${dados.valor} para ${dados.destino} não será mais enviado.`;
}

export function respostaListaAgendamentos(
  itens: { id: string; valor: string; destino: string; repeticao: string; quando: string }[],
): string {
  if (itens.length === 0) return "Você não tem PIX agendado. Quer que eu marque um envio pra sair sozinho?";
  const linhas = itens.map(
    (item) => `${item.id}: R$ ${item.valor} para ${item.destino}, ${item.repeticao}, próximo em ${item.quando}.`,
  );
  return `PIX agendados: ${linhas.join(" ")} Pra cancelar, me manda o código.`;
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
    return `O PIX agendado de R$ ${dados.valor} para ${dados.destino} foi enviado porque o envio já tinha começado. Não haverá próximo envio.${comprovante}${taxa} Saldo agora: R$ ${dados.saldo}.`;
  }
  const proximo = dados.proximo === undefined ? "" : ` O próximo envio está marcado para ${dados.proximo}.`;
  return `PIX agendado de R$ ${dados.valor} enviado para ${dados.destino}.${comprovante}${taxa} Saldo agora: R$ ${dados.saldo}.${proximo}`;
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
