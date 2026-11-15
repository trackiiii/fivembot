import type { Fala } from "../tipos.js";

export const linhabank: Fala[] = [
  { id: "lb-1", texto: "O LinhaBank é a sua carteira neste chat{nome}. Saldo, PIX, depósito e transferência ficam aqui comigo. Quer que eu te mostre o saldo?" },
  { id: "lb-2", texto: "Aaaah, o LinhaBank. É a conta de vocês, em real, no Telegram. Eu sou a Thialinha e te atendo. O que você quer saber?" },
  { id: "lb-3", texto: "Aqui a conta é sua. PIX entre contas LinhaBank não tem taxa. Para fora, eu falo a taxa antes. Quer mandar ou receber?" },
  { id: "lb-4", texto: "A gente funciona 24 horas. Madrugada, domingo, feriado. PIX entra e sai da sua conta. Quer depositar?" },
  { id: "lb-5", texto: "Resumindo: você abre a conta no /start, eu cuido do atendimento, e o dinheiro só mexe quando o sistema confirma. Sem surpresa. O que você precisa?" },
  { id: "lb-6", texto: "LinhaBank não é aplicativo cheio de tela. É este papo. Saldo, extrato, QR de depósito, transferência. Por onde você quer começar?" },
  { id: "lb-7", texto: "A chave daqui serve para outra conta LinhaBank. Para banco de fora, a gente usa PIX de verdade. Quer que eu explique um dos dois?" },
  { id: "lb-8", texto: "Pode ficar tranquilo{nome}: eu não peço senha, código nem foto de documento. A conta anda neste chat. Me conta o que você quer fazer." },
];

export const cadastro: Fala[] = [
  { id: "cad-1", texto: "Calmaaa, a conta ainda não está aberta{nome}. Manda /start e responde CONCORDO. Aí eu abro a sua carteira, tá?" },
  { id: "cad-2", texto: "Pra te atender de verdade, preciso do aceite dos termos. Envia /start e, se estiver de acordo, responde CONCORDO. Posso te explicar os termos?" },
  { id: "cad-3", texto: "Ainda não tem conta neste chat. É rápido: /start, lê os termos e manda CONCORDO. Quer que eu te mostre o texto?" },
  { id: "cad-4", texto: "Sem o CONCORDO eu não consigo criar a carteira. Não é frescura, é pra conta ser sua. Manda /start quando quiser." },
  { id: "cad-5", texto: "Oi! Pra abrir, é /start e CONCORDO. Depois eu te entrego agência, número e a chave daqui. Vamos nessa?" },
  { id: "cad-6", texto: "A abertura é neste chat mesmo. Sem link, sem app extra. /start e CONCORDO. Qualquer dúvida dos termos, me pergunta." },
  { id: "cad-7", texto: "Ainda não achei conta sua aqui. Se já concordou em outro lugar, neste chat a gente abre de novo com /start. Quer que eu te guie?" },
];

export const saldo: Fala[] = [
  { id: "sal-1", texto: "Prontinho{nome}! Seu saldo é R$ {saldo}. Quer ver o extrato?" },
  { id: "sal-2", texto: "Olha só: R$ {saldo} na conta. Quer depositar ou mandar um PIX?" },
  { id: "sal-3", texto: "Tá aqui, sem invenção: o sistema mostra R$ {saldo}. Posso puxar o extrato pra você?" },
  { id: "sal-4", texto: "Seu saldo agora é R$ {saldo}. Se quiser, a gente olha as últimas movimentações." },
  { id: "sal-5", texto: "Opa, consultei. Saldo: R$ {saldo}. Tá precisando receber ou enviar?" },
  { id: "sal-6", texto: "Beleza{nome}. Tá com R$ {saldo}. Quer que eu gere um QR pra depositar?" },
  { id: "sal-7", texto: "Atualizei com o sistema. Saldo de R$ {saldo}. Te ajudo em mais alguma coisa?" },
];

export const extratos: Fala[] = [
  { id: "ext-1", texto: "Separei o histórico pra você{nome}. Saldo R$ {saldo}. {extrato} Quer que eu explique alguma linha?" },
  { id: "ext-2", texto: "Extrato na mão. Saldo R$ {saldo}. {extrato}" },
  { id: "ext-3", texto: "Olha o que o sistema registrou. Saldo R$ {saldo}. {extrato} Precisa do comprovante de alguma delas?" },
  { id: "ext-4", texto: "Ainda está quietinho por aqui. Saldo R$ {saldo}. {extrato}" },
  { id: "ext-5", texto: "Prontinho. Movimentações da conta, com saldo R$ {saldo}: {extrato}" },
  { id: "ext-6", texto: "Tá aqui o rastro da conta. Saldo R$ {saldo}. {extrato} Quer filtrar depósito ou PIX?" },
];

export const comprovantes: Fala[] = [
  { id: "cmp-1", texto: "Foto ou arquivo de comprovante não coloca dinheiro na conta, tá{nome}? O saldo só muda quando o pagamento confirma. Quer gerar um QR pra depositar?" },
  { id: "cmp-2", texto: "Calmaaa, eu vi o comprovante, mas eu não posso creditar por foto. Quem confirma é o pagamento. Posso te passar o copia e cola certinho." },
  { id: "cmp-3", texto: "Entendo a pressa. Mesmo assim, comprovante enviado aqui não altera saldo. O sistema avisa quando cair. Quer que eu olhe se tem cobrança aberta?" },
  { id: "cmp-4", texto: "Não invento depósito. Se o PIX já foi pago, a confirmação chega sozinha. Enquanto isso, posso te mostrar o QR de novo." },
  { id: "cmp-5", texto: "Aaaah, entendi o comprovante. Ele não entra como crédito. Se você já pagou, a gente espera a confirmação. Quer o código copia e cola?" },
  { id: "cmp-6", texto: "Por segurança, eu nunca subo saldo porque alguém mandou print. O aviso vem do pagamento. Posso conferir o saldo atual, se quiser." },
];

export const faq: Fala[] = [
  { id: "faq-1", texto: "PIX daqui funciona de madrugada, sim. Fim de semana também. Se a chave for LinhaBank, eu reconheço e não tem taxa. Quer mandar um?" },
  { id: "faq-2", texto: "Depósito é QR ou copia e cola. O valor só entra depois da confirmação, nunca porque mandou print. Quer gerar um agora?" },
  { id: "faq-3", texto: "Transferência entre contas LinhaBank usa a chave lb ou o número de 8 dígitos, sem taxa. PIX pra fora pode ter taxa, e eu falo antes. Qual dos dois?" },
  { id: "faq-4", texto: "Limite de cada envio neste chat: R$ 5.000,00. Se precisar de mais, a gente conversa no que o sistema permitir. Quer enviar quanto?" },
  { id: "faq-5", texto: "Cartão virtual existe, mas eu só mostro os 4 últimos. Bloqueio e desbloqueio neste chat. Não peço CVV. Quer ver o final?" },
  { id: "faq-6", texto: "Agendamento de PIX sai sozinho no horário de Brasília, até você cancelar o código. Quer agendar um?" },
  { id: "faq-7", texto: "Eu não peço senha, SMS nem foto de documento. Se alguém pedir isso no seu nome, não é o LinhaBank. Quer que eu te explique a abertura da conta?" },
  { id: "faq-8", texto: "Protocolo é pra registro de atendimento, não substitui comprovante de PIX. Se quiser um, me conta o assunto que eu abro com o sistema." },
];
