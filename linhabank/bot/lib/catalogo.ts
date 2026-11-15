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
      "Comprovante enviado pelo cliente, em foto ou texto, não altera o saldo.",
    ],
  },
};
