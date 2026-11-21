export const TEMAS = ["conta", "pix", "cartao", "atendimento", "seguranca", "clube", "cofrinho"] as const;

export type Tema = (typeof TEMAS)[number];

export type ItemCatalogo = {
  titulo: string;
  fatos: string[];
};

export const CATALOGO: Record<Tema, ItemCatalogo> = {
  conta: {
    titulo: "Conta LinhaBank",
    fatos: [
      "Cada pessoa que aceita os termos abre a própria conta neste chat. O saldo e o extrato ficam no LinhaBank.",
      "Agência 0001, o número e a chave interna servem só para transferência entre contas LinhaBank.",
      "A conta abre com saldo zero. O saldo sobe quando um depósito PIX é confirmado ou quando outra conta LinhaBank envia um valor.",
      "Depósito via PIX usa QR Code e código copia e cola. Foto de comprovante não credita saldo.",
    ],
  },
  pix: {
    titulo: "PIX LinhaBank",
    fatos: [
      "O PIX funciona 24 horas, inclusive de madrugada e no fim de semana.",
      "PIX enviado sai da conta LinhaBank. PIX recebido entra nessa conta.",
      "A chave de uma conta LinhaBank é reconhecida sozinha no PIX. Esse envio não tem taxa.",
      "A chave LinhaBank não serve para outros bancos.",
      "PIX para fora do LinhaBank pode ter taxa. A taxa vigente é informada antes da confirmação. Sem taxa configurada, o valor da taxa é zero.",
      "A Thialinha confirma o PIX enviado com o comprovante quando ele existe.",
      "O cliente deposita gerando um QR Code neste chat. O saldo só muda depois da confirmação do pagamento.",
      "Cada envio neste chat vai até R$ 5.000,00.",
      "Um PIX pode ser agendado para um horário, uma vez, todo dia, toda semana ou todo mês. Depois de confirmado, o envio acontece sozinho até o cliente cancelar.",
      "O cliente cancela um PIX agendado neste chat, informando o código do agendamento.",
    ],
  },
  cartao: {
    titulo: "Cartão LinhaBank",
    fatos: [
      "A conta tem um cartão virtual. A Thialinha mostra só os 4 últimos dígitos.",
      "Ela bloqueia e desbloqueia o cartão neste chat.",
      "Ela não pede o número completo, a validade nem o CVV.",
    ],
  },
  atendimento: {
    titulo: "Atendimento",
    fatos: [
      "A Thialinha atende o LinhaBank neste chat.",
      "Depois de abrir a conta, o cliente escolhe: falar com a Thialinha ou operar pelo menu de botões. Dá para trocar com /menu ou /conversa.",
      "Ela explica os serviços, opera a conta de quem aceitou os termos e abre protocolo de atendimento.",
      "Este chat atende de forma contínua.",
    ],
  },
  seguranca: {
    titulo: "Segurança",
    fatos: [
      "O LinhaBank não pede senha, PIN, código SMS, token, CVV nem foto de documento neste chat.",
      "Se o cliente enviar um desses dados, oriente a não repetir o dado neste chat.",
      "Este chat não envia link de pagamento.",
      "Comprovante enviado pelo cliente, em foto ou texto, não altera o saldo.",
    ],
  },
  clube: {
    titulo: "LINHABANK CLUB",
    fatos: [
      "O LINHABANK CLUB é o programa de fidelidade do LinhaBank: LBcoins, indicações e categorias Bronze, Prata e Ouro.",
      "LBcoins são pontos de fidelidade. Não são dinheiro, saldo bancário, Pix nem moeda sacável.",
      "A categoria depende de XP, não do saldo de LBcoins. Bronze, Prata e Ouro sobem automaticamente quando o XP chega no limite vigente.",
      "O programa LINHABANK INDIQUE E GANHE dá um código e um link de convite. Abrir o bot pelo link não credita LBcoins. A recompensa só cai quando a indicação é aprovada.",
      "Uma pessoa não indica a si mesma. Cada conta só pode ser indicada uma vez. A gerência configura o valor e o critério de aprovação.",
      "O cliente consulta o Club neste chat com /club. A Thialinha só informa números que a ferramenta devolver.",
    ],
  },
  cofrinho: {
    titulo: "Cofrinho",
    fatos: [
      "O cofrinho separa dinheiro da própria conta. Não é LBcoins e não é outra conta.",
      "Guardar tira do saldo disponível. Resgatar devolve para a conta. Não tem taxa.",
      "O cofrinho não tem rendimento. O valor não cresce sozinho.",
      "PIX, transferência e boleto usam só o saldo disponível. O que está no cofrinho fica parado até o resgate.",
      "Dá para ter até 8 cofrinhos, cada um com nome e meta opcional. A meta não move dinheiro.",
      "Encerrar só é possível com o cofrinho zerado.",
      "O cliente abre com /cofrinho. A Thialinha só informa valores que a conta devolver.",
    ],
  },
};
