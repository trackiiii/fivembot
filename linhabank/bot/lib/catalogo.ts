export const TEMAS = ["conta", "pix", "cartao", "atendimento", "seguranca"] as const;

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
      "A conta abre com saldo zero. O saldo sobe quando entra um PIX pela gateway.",
    ],
  },
  pix: {
    titulo: "PIX LinhaBank",
    fatos: [
      "Enviar e receber PIX passa pela gateway. O saldo debitado ou creditado é o do LinhaBank.",
      "A chave interna, a agência e o número da conta não são chave PIX para outros bancos.",
      "A Thialinha confirma o PIX enviado só com o endToEndId da gateway.",
      "Cada envio neste chat vai até R$ 5.000,00.",
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
      "A atendente virtual do LinhaBank é a Thialinha.",
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
    ],
  },
};
