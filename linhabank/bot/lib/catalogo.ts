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
      "A conta é digital. A abertura é feita no aplicativo LinhaBank.",
      "A Thialinha não abre conta, não altera cadastro e não vê saldo.",
      "Saldo e extrato ficam somente no aplicativo.",
    ],
  },
  pix: {
    titulo: "PIX LinhaBank",
    fatos: [
      "O cliente envia e recebe PIX no aplicativo LinhaBank.",
      "O aplicativo aceita chave de CPF, e-mail, celular e chave aleatória.",
      "O PIX do arranjo brasileiro funciona 24 horas, inclusive fim de semana. Uma indisponibilidade aparece no aplicativo.",
      "A Thialinha não faz PIX, não altera limite e não trata mensagem de chat como comprovante.",
      "Limite, chave e comprovante ficam no aplicativo.",
    ],
  },
  cartao: {
    titulo: "Cartão LinhaBank",
    fatos: [
      "O cartão de débito e o de crédito são pedidos no aplicativo.",
      "Fatura, limite e bloqueio temporário ficam no aplicativo.",
      "Em perda ou roubo, o cliente bloqueia o cartão no aplicativo e pode abrir um protocolo com a Thialinha.",
      "A Thialinha não pede o número completo do cartão, a validade nem o CVV.",
    ],
  },
  atendimento: {
    titulo: "Atendimento",
    fatos: [
      "A atendente virtual do LinhaBank é a Thialinha.",
      "Ela explica os serviços do catálogo e abre protocolo de atendimento.",
      "Ela não movimenta dinheiro e não acessa a conta.",
      "Este chat atende de forma contínua. As operações da conta continuam no aplicativo.",
    ],
  },
  seguranca: {
    titulo: "Segurança",
    fatos: [
      "O LinhaBank não pede senha, PIN, código SMS, token, CVV nem foto de documento neste chat.",
      "Se o cliente enviar um desses dados, oriente a trocar a senha no aplicativo e a não repetir o dado.",
      "Este chat não envia link de pagamento.",
    ],
  },
};
