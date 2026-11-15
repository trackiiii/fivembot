export const RESPOSTA_AJUDA =
  "Sua conta LinhaBank está ativa. Posso consultar saldo e extrato, enviar PIX, transferir entre contas LinhaBank, pagar boleto ou bloquear o cartão virtual. O que você precisa?";

export const RESPOSTA_SEM_CONTA =
  "A conta ainda não está aberta. Envie /start e responda CONCORDO para concluir a abertura. Deseja que eu explique os termos?";

export const RESPOSTA_PIX_INDISPONIVEL =
  "O PIX não foi enviado. O saldo permanece o mesmo. Deseja tentar novamente?";

export const RESPOSTA_DESTINO_INTERNO =
  "O destino informado é uma conta LinhaBank. Nesse caso, a operação correta é uma transferência. Deseja continuar?";

export const RESPOSTA_SEGREDO =
  "Não envie senha, código ou dados do cartão neste atendimento. Não repita esse dado aqui.";

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

export function respostaPixEnviado(dados: { valor: string; destino: string; saldo: string; comprovante?: string }): string {
  const comprovante = dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : ` Comprovante ${dados.comprovante}.`;
  return `PIX de R$ ${dados.valor} enviado para ${dados.destino}.${comprovante} Saldo: R$ ${dados.saldo}.`;
}

export function respostaTransferencia(dados: { valor: string; destino: string; saldo: string }): string {
  return `Transferência de R$ ${dados.valor} realizada para a conta ${dados.destino}. Saldo: R$ ${dados.saldo}.`;
}

export function respostaBoleto(dados: { valor: string; descricao: string; saldo: string }): string {
  return `Pagamento de R$ ${dados.valor} registrado: ${dados.descricao}. Saldo: R$ ${dados.saldo}.`;
}

export function respostaPixRecebido(dados: { valor: string; saldo: string; comprovante?: string }): string {
  const comprovante = dados.comprovante === undefined || dados.comprovante.length === 0 ? "" : ` Comprovante ${dados.comprovante}.`;
  return `PIX de R$ ${dados.valor} recebido na sua conta. Saldo: R$ ${dados.saldo}.${comprovante}`;
}
