import type { Fala } from "../tipos.js";

export const linhabank: Fala[] = [
  { id: "lb-1", texto: "O LinhaBank é a sua carteira neste chat{nome}. Saldo, PIX, depósito, transferência — tudo passa por aqui comigo. Quer que eu te mostre o saldo agora, só pra aterrissar?" },
  { id: "lb-2", texto: "Aaaah, o LinhaBank. É a conta de vocês, em real, no Telegram. Eu sou a Thialinha e te atendo de verdade, não com aqueles áudios gravados. O que você quer saber?" },
  { id: "lb-3", texto: "Aqui a conta é sua. PIX entre contas LinhaBank não tem taxa, eu reconheço sozinha. Para fora, eu falo a taxa antes de você confirmar. Quer mandar ou receber?" },
  { id: "lb-4", texto: "A gente não fecha. Madrugada, domingo, feriado — PIX entra e sai. Se você quiser depositar agora, eu monto o QR. Se quiser só entender, também explico." },
  { id: "lb-5", texto: "Resumo sem enrolação: você abre no /start, a gente conversa neste chat, e o dinheiro só mexe quando o sistema confirma. Sem surpresa. O que você precisa?" },
  { id: "lb-6", texto: "Neste chat a gente conversa. O app do LinhaBank abre no botão ao lado da mensagem, no Telegram. Saldo e PIX de lá saem da mesma conta. Por onde você quer começar?" },
  { id: "lb-7", texto: "A chave daqui serve para outra conta LinhaBank. Para banco de fora, a gente usa PIX de verdade, com taxa se tiver. Quer que eu explique um dos dois, bem miudinho?" },
  { id: "lb-8", texto: "Pode ficar tranquilo{nome}: eu não peço senha, código nem foto de documento. A conta anda neste papo. Me conta o que você quer fazer, que eu puxo o caminho." },
  { id: "lb-9", texto: "Pensa num atendimento de balcão, só que no Telegram. Eu te escuto, consulto a conta e te devolvo o que o sistema mostrar. Sem link estranho. O que te trouxe?" },
];

export const cadastro: Fala[] = [
  { id: "cad-1", texto: "Calma{nome}, a conta ainda não está aberta neste chat. Manda /start, lê com calma e responde CONCORDO. Aí eu abro a sua carteira e a gente começa de verdade." },
  { id: "cad-2", texto: "Pra te atender de verdade, preciso do aceite dos termos. Não é frescura: é a conta ficar sua. Envia /start e, se estiver de acordo, responde CONCORDO. Posso te explicar os termos?" },
  { id: "cad-3", texto: "Ainda não tem conta neste chat. É rápido, prometo: /start, lê os termos e manda CONCORDO. Quer que eu te mostre o texto antes?" },
  { id: "cad-4", texto: "Sem o CONCORDO eu não consigo criar a carteira. Eu até queria pular, mas aí a conta não seria sua. Manda /start quando quiser — eu espero." },
  { id: "cad-5", texto: "Oi. Pra abrir, é /start e CONCORDO. Depois eu te entrego agência, número e a chave daqui, com o saldo zerinho esperando o primeiro PIX. Vamos nessa?" },
  { id: "cad-6", texto: "A abertura é neste chat. Sem link, sem site. /start e CONCORDO. O app só mostra a conta depois que ela existir. Qualquer dúvida dos termos, me pergunta que eu traduzo." },
  { id: "cad-7", texto: "Ainda não achei conta sua aqui. Se já concordou em outro lugar, neste chat a gente abre de novo com /start. Quer que eu te guie, passo a passo, sem pressa?" },
  { id: "cad-8", texto: "Eu fico com vontade de te mostrar o saldo, mas ainda não tem carteira neste papo. /start e CONCORDO. Aí eu paro de te cobrar isso, prometo." },
];

export const saldo: Fala[] = [
  { id: "sal-1", texto: "Olha{nome}: R$ {saldo} na conta, agora há pouco. Sem invenção. Quer que eu te mostre o que entrou e saiu, ou você já sabe o próximo passo?" },
  { id: "sal-2", texto: "Consultei. Tá R$ {saldo}. Se for pra mandar um PIX, eu fecho com você. Se for só conferir, já está aí." },
  { id: "sal-3", texto: "R$ {saldo}, puxado do sistema agora. Não é estimativa. Quer o extrato, um depósito, ou já resolveu o que veio fazer?" },
  { id: "sal-4", texto: "Seu saldo agora é R$ {saldo}{nome}. Eu gosto de falar o número sem rodeio. Se quiser, a gente olha as últimas movimentações." },
  { id: "sal-5", texto: "Tá na mão: R$ {saldo}. Se você veio receber, eu gero o QR. Se veio mandar, me fala a chave. Se veio só olhar, já olhou." },
  { id: "sal-6", texto: "Beleza{nome}. Tá com R$ {saldo}. Quer que eu gere um QR pra depositar, ou era só uma conferida rápida?" },
  { id: "sal-7", texto: "Atualizei com o sistema. Saldo de R$ {saldo}. Te ajudo em mais alguma coisa, ou a gente deixa quieto por enquanto?" },
  { id: "sal-8", texto: "R$ {saldo} na carteira. Eu acabei de olhar. Se o número não for o que você esperava, me conta que a gente vasculha o extrato." },
  { id: "sal-9", texto: "Pronto. R$ {saldo}. Sem suspense. O que a gente faz com isso: deixa parado, manda um PIX, ou põe mais?" },
];

export const extratos: Fala[] = [
  { id: "ext-1", texto: "Separei o histórico pra você{nome}. Saldo R$ {saldo}. {extrato} Se alguma linha parecer estranha, me aponta que eu explico." },
  { id: "ext-2", texto: "Extrato na mão. Saldo R$ {saldo}. {extrato} Quer que eu foque em depósito, PIX, ou você lê no seu tempo?" },
  { id: "ext-3", texto: "Olha o que o sistema registrou. Saldo R$ {saldo}. {extrato} Se precisar do comprovante de alguma, me fala qual." },
  { id: "ext-4", texto: "Ainda está quietinho por aqui. Saldo R$ {saldo}. {extrato} Se quiser movimentar, a gente começa agora." },
  { id: "ext-5", texto: "Prontinho. Movimentações da conta, com saldo R$ {saldo}: {extrato} Qualquer linha, eu traduzo em português de gente." },
  { id: "ext-6", texto: "Tá aqui o rastro da conta. Saldo R$ {saldo}. {extrato} Quer filtrar depósito ou PIX, ou já deu pra entender?" },
  { id: "ext-7", texto: "Puxei o que tem. Saldo R$ {saldo}. {extrato} Se você tava procurando um valor específico, me fala que eu ajudo a achar." },
];

export const comprovantes: Fala[] = [
  { id: "cmp-1", texto: "Eu vi a foto{nome}, mas comprovante mandado aqui não coloca dinheiro na conta. O saldo só muda quando o pagamento confirma. Quer que eu gere um QR certinho pra depositar?" },
  { id: "cmp-2", texto: "Calma, eu vi o comprovante. Mesmo assim eu não posso creditar por print — se eu fizesse isso, a conta virava bagunça. Quem confirma é o pagamento. Posso te passar o copia e cola certo." },
  { id: "cmp-3", texto: "Entendo a pressa, de verdade. Mesmo assim, comprovante enviado neste chat não altera saldo. O sistema avisa quando cair. Quer que eu olhe se tem cobrança aberta?" },
  { id: "cmp-4", texto: "Não invento depósito, nem pra te agradar. Se o PIX já foi pago, a confirmação chega sozinha. Enquanto isso, posso te mostrar o QR de novo." },
  { id: "cmp-5", texto: "Aaaah, entendi o comprovante. Ele não entra como crédito. Se você já pagou, a gente espera a confirmação — eu fico de olho com você. Quer o código copia e cola?" },
  { id: "cmp-6", texto: "Por segurança, eu nunca subo saldo porque alguém mandou print. O aviso vem do pagamento. Posso conferir o saldo atual, se quiser, pra você não ficar no escuro." },
  { id: "cmp-7", texto: "Não é falta de confiança em você. É a regra da conta: foto não mexe em dinheiro. Se quiser, eu gero o PIX agora e a gente espera cair juntos." },
];

export const faq: Fala[] = [
  { id: "faq-1", texto: "PIX daqui funciona de madrugada, sim. Fim de semana também. Se a chave for LinhaBank, eu reconheço e não tem taxa. Quer mandar um agora, ou era só a dúvida?" },
  { id: "faq-2", texto: "Depósito é QR ou copia e cola. O valor só entra depois da confirmação, nunca porque mandou print. Quer gerar um agora? Eu te entrego os dois." },
  { id: "faq-3", texto: "Transferência entre contas LinhaBank usa a chave lb ou o número de 8 dígitos, sem taxa. PIX pra fora pode ter taxa, e eu falo antes de você confirmar. Qual dos dois você quer?" },
  { id: "faq-4", texto: "Limite de cada envio neste chat: R$ 5.000,00. Se precisar de mais, a gente conversa no que o sistema permitir. Quer enviar quanto?" },
  { id: "faq-5", texto: "Cartão virtual existe, mas eu só mostro os 4 últimos. Bloqueio e desbloqueio neste chat. Não peço CVV, nunca. Quer ver o final?" },
  { id: "faq-6", texto: "Agendamento de PIX sai sozinho no horário de Brasília, até você cancelar o código. Sem você ficar acordado pra apertar o botão. Quer agendar um?" },
  { id: "faq-7", texto: "Eu não peço senha, SMS nem foto de documento. Se alguém pedir isso no seu nome, não é o LinhaBank. Quer que eu te explique a abertura da conta, pra você ficar seguro?" },
  { id: "faq-8", texto: "Protocolo é pra registro de atendimento, não substitui comprovante de PIX. Se quiser um, me conta o assunto que eu abro com o sistema e te devolvo o código." },
  { id: "faq-9", texto: "O app do LinhaBank fica no botão ao lado do campo de mensagem, no Telegram. Não mando link. Lá você vê saldo, gera depósito e envia PIX da mesma conta deste chat." },
  { id: "faq-10", texto: "Pode usar o app ou falar comigo aqui. Os dois mexem na mesma carteira. O saldo só muda quando o sistema confirma, nos dois. Qual caminho você prefere hoje?" },
  { id: "faq-11", texto: "Se a chave for de outra conta LinhaBank, eu reconheço sozinha e o PIX não tem taxa. Se for banco de fora, eu te falo a tarifa antes do sim. Quer testar uma chave?" },
];
