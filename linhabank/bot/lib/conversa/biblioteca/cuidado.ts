import type { Fala } from "../tipos.js";

export const tecnico: Fala[] = [
  { id: "tec-1", texto: "Poxa{nome}, deu uma travada aqui. O saldo não mudou. Pode tentar de novo em instantes?" },
  { id: "tec-2", texto: "Calmaaa, não consegui concluir agora. Nada foi debitado por causa disso. Tentamos outra vez?" },
  { id: "tec-3", texto: "Hmm, o sistema não me devolveu a operação. Melhor a gente repetir do que eu inventar. Pode mandar de novo?" },
  { id: "tec-4", texto: "Tive um soluço técnico. Sua conta segue como estava. Quer que eu tente o saldo, só pra conferir?" },
  { id: "tec-5", texto: "Não rolou desta vez. Sem cobrança fantasma, sem crédito fantasma. A gente tenta de novo?" },
  { id: "tec-6", texto: "Eita. Falhou do meu lado. Me dá um minutinho e manda outra vez, por favor." },
];

export const seguranca: Fala[] = [
  { id: "seg-1", texto: "Ei{nome}, não manda senha, código, CVV nem número de cartão neste chat, tá? Não repete esse dado aqui." },
  { id: "seg-2", texto: "Paraaa, isso eu não peço. Senha e código não entram neste atendimento. Se alguém pediu, não fui eu." },
  { id: "seg-3", texto: "Por segurança: eu nunca peço token, SMS nem foto de documento. Se você já mandou, não manda de novo." },
  { id: "seg-4", texto: "Relaxa, a conta anda sem senha neste chat. Se colou um código por engano, troca ele onde você gerou e não repete aqui." },
  { id: "seg-5", texto: "Isso é dado sensível. Não guarda isso no Telegram comigo. Eu não vou repetir e você também não precisa." },
  { id: "seg-6", texto: "LinhaBank não envia link de pagamento e não pede selfie de documento. Se aparecer isso, desconfia. Quer que eu te explique como o depósito funciona de verdade?" },
];

export const reclamacoes: Fala[] = [
  { id: "rec-1", texto: "Poxa{nome}, sinto muito. Me conta o que aconteceu, sem pressa. Se quiser, eu abro um protocolo pra ficar registrado." },
  { id: "rec-2", texto: "Entendi a chateação. Vou te ouvir de verdade. Qual parte deu ruim: depósito, PIX, saldo?" },
  { id: "rec-3", texto: "Você tem razão de cobrar. Me passa o resumo que eu te ajudo e, se quiser registro, abro protocolo." },
  { id: "rec-4", texto: "Aaaah, que chato. Desculpa pelo aperto. Vamos resolver o que o sistema mostrar, sem enrolação." },
  { id: "rec-5", texto: "Tô do seu lado nisso. Me fala o valor e o que você esperava que acontecesse. Aí eu confiro no sistema, não no achismo." },
  { id: "rec-6", texto: "Reclamação pra mim é atendimento, não briga. Pode desabafar. Depois a gente vê saldo, comprovante ou protocolo." },
];

export const impaciente: Fala[] = [
  { id: "imp-1", texto: "Calmaaa{nome}, eu tô aqui. A gente resolve agora. Me diz só o que você está esperando: saldo, depósito ou PIX." },
  { id: "imp-2", texto: "Respira comigo. Sem enrolação. O que está travado pra você neste instante?" },
  { id: "imp-3", texto: "Entendi a pressa. Vou direto ao ponto. Saldo, QR ou transferência?" },
  { id: "imp-4", texto: "Tá, sem rodeio. Me fala o valor ou o que não caiu que eu consulto o sistema." },
  { id: "imp-5", texto: "Pode ficar nervoso, eu não levo pro pessoal. Mas eu só confirmo o que o sistema confirmar, tá? O que você quer que eu olhe agora?" },
  { id: "imp-6", texto: "Já tô em cima. Sem menu, sem espera. Manda o pedido objetivo que eu cubro." },
];

export const incompreensao: Fala[] = [
  { id: "inc-1", texto: "Iiih{nome}, não peguei direito. Pode mandar de outro jeito? Saldo, depósito, PIX, extrato..." },
  { id: "inc-2", texto: "Aaaah, não entendi. Me fala com outras palavras, bem soltinho." },
  { id: "inc-3", texto: "Fui burra agora. Repete pra mim? Pode ser curto." },
  { id: "inc-4", texto: "Não tenho uma resposta boa pra isso ainda. Se for da conta, me fala saldo, PIX ou depósito. Se for outra coisa, tenta explicar de novo." },
  { id: "inc-5", texto: "Hmm, ficou solto pra mim. Você quer consultar, mandar ou receber?" },
  { id: "inc-6", texto: "Desculpa, não encavalei. Manda de novo, por favor." },
  { id: "inc-7", texto: "Pode ser que eu tenha me perdido. Quer olhar a conta ou era só um oi?" },
];
