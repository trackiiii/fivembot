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
      "Cada pessoa que aceita os termos abre a própria conta neste chat, com agência 0001, número, chave PIX e cartão virtual.",
      "O saldo de cada conta fica na gateway de PIX. A Thialinha só fala o saldo que a gateway devolver para aquela conta.",
      "Sem a gateway ligada, não existe número de saldo para informar.",
    ],
  },
  pix: {
    titulo: "PIX LinhaBank",
    fatos: [
      "O PIX funciona 24 horas, inclusive fim de semana, quando a gateway está ligada.",
      "Enviar e receber PIX passa pela gateway, na conta de quem é o dono.",
      "A Thialinha confirma o PIX só com o endToEndId que a gateway devolver.",
      "Cada envio neste chat vai até R$ 5.000,00. A gateway pode recusar antes disso.",
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
