import type { Fala } from "../tipos.js";

export const tecnico: Fala[] = [
  { id: "tec-1", texto: "Poxa{nome}, deu uma travada daqui. O saldo não mudou. Pode tentar de novo daqui a instantes?" },
  { id: "tec-2", texto: "Não consegui concluir agora. Nada foi debitado. Tentamos outra vez?" },
  { id: "tec-3", texto: "Hmm, não veio a operação. Melhor repetir do que eu inventar um número." },
  { id: "tec-4", texto: "Tive um soluço. Sua conta segue como estava. Quer que eu tente o saldo, só pra você ficar tranquilo?" },
  { id: "tec-5", texto: "Não rolou desta vez. Sem cobrança fantasma. A gente tenta de novo?" },
  { id: "tec-6", texto: "Eita. Falhou do meu lado, não do seu. Me dá um minutinho e manda outra vez?" },
  { id: "tec-7", texto: "Travou. Chato, eu sei. A conta não mexeu. Se você mandar de novo, eu tento." },
];

export const seguranca: Fala[] = [
  { id: "seg-1", texto: "Ei{nome}, não manda senha, código, CVV nem número de cartão neste chat. Não repete esse dado aqui. Eu não peço isso." },
  { id: "seg-2", texto: "Para. Isso eu não peço. Senha e código não entram neste atendimento. Se alguém pediu, não fui eu." },
  { id: "seg-3", texto: "Eu nunca peço token, SMS nem foto de documento. Se você já mandou, não manda de novo." },
  { id: "seg-4", texto: "A conta anda sem senha neste chat. Se colou um código por engano, troca ele onde você gerou e não repete aqui." },
  { id: "seg-5", texto: "Isso é dado sensível. Não guarda isso no Telegram comigo. Eu não vou repetir." },
  { id: "seg-6", texto: "LinhaBank não envia link de pagamento e não pede selfie de documento. Se aparecer isso, não clica." },
  { id: "seg-7", texto: "Você não precisa me provar nada com senha. Me fala o que você queria fazer — saldo, PIX, depósito — que eu te levo." },
];

export const reclamacoes: Fala[] = [
  { id: "rec-1", texto: "Poxa{nome}, sinto muito. Me conta o que aconteceu, sem pressa. Se quiser, depois eu abro um protocolo." },
  { id: "rec-2", texto: "Entendi a chateação. Qual parte deu ruim: depósito, PIX ou saldo?" },
  { id: "rec-3", texto: "Você tem razão de cobrar. Me passa o resumo que eu te ajudo. Se quiser registro, abro protocolo." },
  { id: "rec-4", texto: "Que chato. Desculpa pelo aperto. Vamos resolver o que der pra resolver agora." },
  { id: "rec-5", texto: "Tô do seu lado nisso. Me fala o valor e o que você esperava. Aí eu confiro." },
  { id: "rec-6", texto: "Pode desabafar. Depois a gente vê saldo, comprovante ou protocolo — o que fizer sentido." },
  { id: "rec-7", texto: "Eu não vou te pedir pra ficar calmo. Me conta o que quebrou. A gente olha juntos." },
];

export const impaciente: Fala[] = [
  { id: "imp-1", texto: "Tô aqui{nome}. Me diz só o que você está esperando: saldo, depósito ou PIX." },
  { id: "imp-2", texto: "Entendi a pressa. O que está travado neste instante?" },
  { id: "imp-3", texto: "Vou direto ao ponto. Saldo, QR ou transferência?" },
  { id: "imp-4", texto: "Sem rodeio. Me fala o valor ou o que não caiu." },
  { id: "imp-5", texto: "Pode ficar nervoso. Eu só confirmo o que realmente entrou. O que você quer que eu olhe agora?" },
  { id: "imp-6", texto: "Já tô em cima. Manda o pedido — saldo, PIX, depósito — que eu cubro." },
  { id: "imp-7", texto: "Espera cansa, eu sei. Me dá a pista mais curta possível." },
];

export const incompreensao: Fala[] = [
  { id: "inc-1", texto: "Não peguei direito{nome}. Pode mandar de outro jeito? Saldo, depósito, PIX, extrato…" },
  { id: "inc-2", texto: "Aaaah, não entendi. Me fala com outras palavras, bem soltinho." },
  { id: "inc-3", texto: "Essa passou. Repete pra mim? Pode ser curto." },
  { id: "inc-4", texto: "Ficou solto. Você quer receber um PIX, mandar um, ver saldo… ou era outra coisa?" },
  { id: "inc-5", texto: "Não encavalei. Você quer consultar, mandar ou receber?" },
  { id: "inc-6", texto: "Desculpa, me perdi. Manda de novo, por favor." },
  { id: "inc-7", texto: "Pode ser que eu tenha me perdido. Quer olhar a conta ou era só um oi?" },
  { id: "inc-8", texto: "Me ajuda a te ajudar. Uma frase só: o que você quer que eu faça agora?" },
];
