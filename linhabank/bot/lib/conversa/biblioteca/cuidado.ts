import type { Fala } from "../tipos.js";

export const tecnico: Fala[] = [
  { id: "tec-1", texto: "Poxa{nome}, deu uma travada daqui. O saldo não mudou, relaxa. Pode tentar de novo daqui a instantes? Eu fico." },
  { id: "tec-2", texto: "Não consegui concluir agora. Nada foi debitado por causa disso, prometo. Tentamos outra vez?" },
  { id: "tec-3", texto: "Hmm, o sistema não me devolveu a operação. Melhor a gente repetir do que eu inventar um número. Pode mandar de novo?" },
  { id: "tec-4", texto: "Tive um soluço técnico. Sua conta segue como estava. Quer que eu tente o saldo, só pra você ficar tranquilo?" },
  { id: "tec-5", texto: "Não rolou desta vez. Sem cobrança fantasma, sem crédito fantasma. A gente tenta de novo, no seu tempo?" },
  { id: "tec-6", texto: "Eita. Falhou do meu lado, não do seu. Me dá um minutinho e manda outra vez, por favor. Eu cubro." },
  { id: "tec-7", texto: "Travou. Chato, eu sei. A conta não mexeu. Se você mandar de novo, eu tento pelo outro caminho." },
];

export const seguranca: Fala[] = [
  { id: "seg-1", texto: "Ei{nome}, não manda senha, código, CVV nem número de cartão neste chat, tá? Não repete esse dado aqui. Eu não peço isso." },
  { id: "seg-2", texto: "Para. Isso eu não peço. Senha e código não entram neste atendimento. Se alguém pediu, não fui eu — desconfia." },
  { id: "seg-3", texto: "Por segurança: eu nunca peço token, SMS nem foto de documento. Se você já mandou, não manda de novo. A conta não precisa disso." },
  { id: "seg-4", texto: "Relaxa, a conta anda sem senha neste chat. Se colou um código por engano, troca ele onde você gerou e não repete aqui." },
  { id: "seg-5", texto: "Isso é dado sensível. Não guarda isso no Telegram comigo. Eu não vou repetir e você também não precisa." },
  { id: "seg-6", texto: "LinhaBank não envia link de pagamento e não pede selfie de documento. Se aparecer isso, não clica. Quer que eu te explique como o depósito funciona de verdade?" },
  { id: "seg-7", texto: "Respira. Você não precisa me provar nada com senha. Me fala o que você queria fazer — saldo, PIX, depósito — que eu te levo pelo caminho certo." },
];

export const reclamacoes: Fala[] = [
  { id: "rec-1", texto: "Poxa{nome}, sinto muito. Me conta o que aconteceu, sem pressa. Eu te escuto primeiro. Se quiser, depois eu abro um protocolo pra ficar registrado." },
  { id: "rec-2", texto: "Entendi a chateação. Vou te ouvir de verdade, não vou te mandar um texto pronto. Qual parte deu ruim: depósito, PIX, saldo?" },
  { id: "rec-3", texto: "Você tem razão de cobrar. Me passa o resumo que eu te ajudo com o que o sistema mostrar. Se quiser registro, abro protocolo." },
  { id: "rec-4", texto: "Que chato. Desculpa pelo aperto. Vamos resolver o que der pra resolver agora, sem enrolação e sem te mandar pra outro lugar." },
  { id: "rec-5", texto: "Tô do seu lado nisso. Me fala o valor e o que você esperava que acontecesse. Aí eu confiro no sistema, não no achismo." },
  { id: "rec-6", texto: "Reclamação pra mim é atendimento, não briga. Pode desabafar. Depois a gente vê saldo, comprovante ou protocolo — o que fizer sentido." },
  { id: "rec-7", texto: "Eu não vou te pedir pra ficar calmo se você estiver nervoso. Me conta o que quebrou. A gente olha juntos." },
];

export const impaciente: Fala[] = [
  { id: "imp-1", texto: "Tô aqui{nome}, sem fila. A gente resolve agora. Me diz só o que você está esperando: saldo, depósito ou PIX." },
  { id: "imp-2", texto: "Entendi a pressa. Sem enrolação. O que está travado pra você neste instante? Eu puxo isso primeiro." },
  { id: "imp-3", texto: "Vou direto ao ponto. Saldo, QR ou transferência? Você escolhe, eu executo." },
  { id: "imp-4", texto: "Tá, sem rodeio. Me fala o valor ou o que não caiu que eu consulto o sistema agora." },
  { id: "imp-5", texto: "Pode ficar nervoso, eu não levo pro pessoal. Mas eu só confirmo o que o sistema confirmar, tá? O que você quer que eu olhe agora?" },
  { id: "imp-6", texto: "Já tô em cima. Sem menu, sem espera. Manda o pedido objetivo que eu cubro — saldo, PIX, depósito, o que for." },
  { id: "imp-7", texto: "Eu sei que espera cansa. Me dá a pista mais curta possível que eu saio correndo com ela." },
];

export const incompreensao: Fala[] = [
  { id: "inc-1", texto: "Não peguei direito{nome}. Pode mandar de outro jeito? Saldo, depósito, PIX, extrato… qualquer uma dessas já me acende." },
  { id: "inc-2", texto: "Aaaah, não entendi. Me fala com outras palavras, bem soltinho, como se eu tivesse do seu lado." },
  { id: "inc-3", texto: "Fui burra agora. Repete pra mim? Pode ser curto. Eu não me ofendo." },
  { id: "inc-4", texto: "Essa passou batido. Você quer receber um PIX, mandar um, ver saldo… ou era outra coisa?" },
  { id: "inc-5", texto: "Ficou solto pra mim. Você quer consultar, mandar ou receber? Se for outra coisa, também serve, só me dá um gancho." },
  { id: "inc-6", texto: "Desculpa, não encavalei. Manda de novo, por favor. Eu leio com mais calma desta vez." },
  { id: "inc-7", texto: "Pode ser que eu tenha me perdido. Quer olhar a conta ou era só um oi? Os dois eu topa." },
  { id: "inc-8", texto: "Me ajuda a te ajudar. Uma frase só: o que você quer que eu faça agora?" },
];
