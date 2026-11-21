import type { Fala } from "../tipos.js";

export const linhabank: Fala[] = [
  { id: "lb-1", texto: "O LinhaBank é a sua conta neste chat{nome}. Saldo e PIX passam por aqui comigo. Quer que eu te mostre o saldo?" },
  { id: "lb-2", texto: "Aaaah, o LinhaBank. Conta em real, neste papo. Eu sou a Thialinha. O que você quer saber?" },
  { id: "lb-3", texto: "PIX entre contas LinhaBank não tem taxa. Pra fora, eu falo a tarifa antes de você confirmar. Quer mandar ou receber?" },
  { id: "lb-4", texto: "A gente não fecha. Madrugada, domingo — PIX entra e sai. Quer depositar agora ou só entender?" },
  { id: "lb-5", texto: "Você abre no /start, a gente conversa aqui, e o dinheiro só mexe quando o pagamento confirma. O que você precisa?" },
  { id: "lb-6", texto: "Neste chat a gente conversa. O app abre no botão ao lado da mensagem, no Telegram. Por onde você quer começar?" },
  { id: "lb-7", texto: "A chave daqui serve pra outra conta LinhaBank. Banco de fora é PIX, com taxa se tiver. Qual dos dois você quer?" },
  { id: "lb-8", texto: "Pode ficar tranquilo{nome}: eu não peço senha nem foto de documento. Me conta o que você quer fazer." },
  { id: "lb-9", texto: "Pensa num atendimento de balcão, no Telegram. Eu te escuto e te devolvo o que a conta mostrar. O que te trouxe?" },
];

export const cadastro: Fala[] = [
  { id: "cad-1", texto: "A conta ainda não está aberta neste chat{nome}. Manda /start, lê e responde CONCORDO. Aí a gente começa." },
  { id: "cad-2", texto: "Pra te atender de verdade, preciso do aceite. /start e, se estiver de acordo, CONCORDO. Posso te explicar os termos?" },
  { id: "cad-3", texto: "Ainda não tem conta aqui. É rápido: /start, lê os termos e manda CONCORDO. Quer que eu te mostre o texto?" },
  { id: "cad-4", texto: "Sem o CONCORDO eu não abro a carteira. Manda /start quando quiser — eu espero." },
  { id: "cad-5", texto: "Pra abrir: /start e CONCORDO. Depois eu te passo agência, número e a chave, com o saldo zerinho. Vamos?" },
  { id: "cad-6", texto: "A abertura é neste chat. Sem site. /start e CONCORDO. Qualquer dúvida dos termos, me pergunta." },
  { id: "cad-7", texto: "Ainda não achei conta sua aqui. Neste chat a gente abre com /start. Quer que eu te guie, passo a passo?" },
  { id: "cad-8", texto: "Eu até queria te mostrar o saldo, mas ainda não tem carteira neste papo. /start e CONCORDO." },
];

export const saldo: Fala[] = [
  { id: "sal-1", texto: "Tá R$ {saldo} na conta{nome}. Quer o extrato ou era só conferir?" },
  { id: "sal-2", texto: "Consultei: R$ {saldo}. Se for pra mandar um PIX, é só falar a chave." },
  { id: "sal-3", texto: "R$ {saldo}, agora há pouco. Quer depositar, mandar, ou já resolveu?" },
  { id: "sal-4", texto: "Seu saldo é R$ {saldo}{nome}. Sem rodeio. Quer que eu olhe as últimas movimentações?" },
  { id: "sal-5", texto: "Tá na mão: R$ {saldo}. Veio receber, mandar, ou só olhar?" },
  { id: "sal-6", texto: "Beleza{nome}. Tá com R$ {saldo}. Era só uma conferida?" },
  { id: "sal-7", texto: "Saldo de R$ {saldo}. Te ajudo em mais alguma coisa?" },
  { id: "sal-8", texto: "R$ {saldo} na carteira. Se não for o que você esperava, a gente olha o extrato." },
  { id: "sal-9", texto: "R$ {saldo}. Deixa parado, manda um PIX ou põe mais — você escolhe." },
];

export const extratos: Fala[] = [
  { id: "ext-1", texto: "Separei o histórico{nome}. Saldo R$ {saldo}.\n\n{extrato}\n\nSe alguma linha parecer estranha, me aponta." },
  { id: "ext-2", texto: "Extrato na mão. Saldo R$ {saldo}.\n\n{extrato}\n\nQuer que eu foque em depósito ou em PIX?" },
  { id: "ext-3", texto: "Olha o que andou na conta. Saldo R$ {saldo}.\n\n{extrato}\n\nSe precisar do comprovante de alguma, me fala qual." },
  { id: "ext-4", texto: "Ainda está quietinho. Saldo R$ {saldo}.\n\n{extrato}\n\nSe quiser movimentar, a gente começa agora." },
  { id: "ext-5", texto: "Movimentações, com saldo R$ {saldo}:\n\n{extrato}\n\nQualquer linha, eu traduzo." },
  { id: "ext-6", texto: "O rastro da conta. Saldo R$ {saldo}.\n\n{extrato}\n\nJá deu pra entender, ou quer filtrar alguma coisa?" },
  { id: "ext-7", texto: "Puxei o que tem. Saldo R$ {saldo}.\n\n{extrato}\n\nTava procurando um valor específico?" },
];

export const comprovantes: Fala[] = [
  { id: "cmp-1", texto: "Eu vi a foto{nome}, mas comprovante aqui não coloca dinheiro na conta. O saldo só muda quando o pagamento confirma. Quer que eu gere um QR?" },
  { id: "cmp-2", texto: "Vi o comprovante. Mesmo assim eu não credito por print. Quem confirma é o pagamento. Posso te passar o copia e cola certo." },
  { id: "cmp-3", texto: "Entendo a pressa. Comprovante neste chat não altera saldo. Quando cair, eu te aviso. Quer que eu olhe se tem cobrança aberta?" },
  { id: "cmp-4", texto: "Não invento depósito, nem pra te agradar. Se o PIX já foi pago, a confirmação chega sozinha. Posso te mostrar o QR de novo." },
  { id: "cmp-5", texto: "Entendi o comprovante. Ele não entra como crédito. A gente espera a confirmação. Quer o copia e cola?" },
  { id: "cmp-6", texto: "Foto não mexe em dinheiro. Posso conferir o saldo atual, se quiser, pra você não ficar no escuro." },
  { id: "cmp-7", texto: "Não é falta de confiança. Foto não sobe saldo. Se quiser, eu gero o PIX agora e a gente espera cair." },
];

export const faq: Fala[] = [
  { id: "faq-1", texto: "PIX daqui funciona de madrugada, sim. Fim de semana também. Chave LinhaBank vai sem taxa. Quer mandar um?" },
  { id: "faq-2", texto: "Depósito é QR ou copia e cola. O valor só entra na confirmação, nunca por print. Quer gerar um agora?" },
  { id: "faq-3", texto: "Entre contas LinhaBank, chave lb ou o número de 8 dígitos, sem taxa. Pra fora pode ter tarifa, e eu falo antes. Qual dos dois?" },
  { id: "faq-4", texto: "Cada envio neste chat vai até R$ 5.000,00. Quer enviar quanto?" },
  { id: "faq-5", texto: "Cartão virtual existe. Eu mostro só os 4 últimos, e bloqueio por aqui. Não peço CVV. Quer ver o final?" },
  { id: "faq-6", texto: "PIX agendado sai sozinho no horário de Brasília, até você cancelar o código. Quer marcar um?" },
  { id: "faq-7", texto: "Eu não peço senha, SMS nem foto de documento. Se alguém pedir isso no seu nome, não é o LinhaBank." },
  { id: "faq-8", texto: "Protocolo é registro de atendimento, não substitui comprovante de PIX. Se quiser um, me conta o assunto." },
  { id: "faq-9", texto: "O app fica no botão ao lado do campo de mensagem, no Telegram. Não mando link. Lá é a mesma conta deste chat." },
  { id: "faq-10", texto: "Pode usar o app ou falar comigo aqui. Os dois mexem na mesma carteira. Qual você prefere hoje?" },
  { id: "faq-11", texto: "Se a chave for LinhaBank, eu reconheço e o PIX não tem taxa. Se for banco de fora, eu falo a tarifa antes. Quer testar uma chave?" },
];
