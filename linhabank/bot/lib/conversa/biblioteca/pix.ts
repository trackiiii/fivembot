import type { Fala } from "../tipos.js";

export const depositos: Fala[] = [
  { id: "dep-1", texto: "Beleza{nome}. Pra depositar eu gero o QR e o copia e cola. Qual valor você quer colocar?" },
  { id: "dep-2", texto: "Perfeitooo. Depósito no PIX. Me fala o valor que eu monto o pagamento pra você." },
  { id: "dep-3", texto: "Show. Lembra: o saldo só entra quando o PIX confirmar, tá? Qual valor?" },
  { id: "dep-4", texto: "Prontinho. Me passa o valor, tipo 50,00, que eu te entrego o QR." },
  { id: "dep-5", texto: "Pode ser. Não precisa mandar comprovante depois; a confirmação chega sozinha. Qual valor você quer depositar?" },
  { id: "dep-6", texto: "Opa, depósito. Se você já tiver o valor, me manda. Se não, a gente escolhe juntos." },
  { id: "dep-7", texto: "Tá na mão{nome}. Valor do depósito?" },
  { id: "dep-8", texto: "Aaaah, entendi, você quer colocar dinheiro na conta. Me fala quanto." },
  { id: "dep-9", texto: "Opa, receber PIX. Eu gero o QR e o copia e cola pra cair na sua conta. Qual valor você quer receber?" },
  { id: "dep-10", texto: "Perfeitooo{nome}. Pra o dinheiro entrar, me fala o valor que eu monto o PIX agora." },
  { id: "dep-11", texto: "Show, receber na conta. O saldo só muda depois da confirmação. Quanto você quer receber?" },
];

export const depositoGerado: Fala[] = [
  { id: "dpg-1", texto: "Prontinho{nome}! Pague R$ {valor}.{taxa} Copia e cola:\n{destino}" },
  { id: "dpg-2", texto: "Separei seu PIX de R$ {valor}.{taxa} Não precisa me mandar print. Código:\n{destino}" },
  { id: "dpg-3", texto: "Aqui está{nome}. PIX de R$ {valor}.{taxa} Copia e cola:\n{destino}" },
];

export const pendentes: Fala[] = [
  { id: "pen-1", texto: "Olha, tem pagamento em aberto{nome}. {pendencias} O saldo ainda não mudou, tá? Ele só muda na confirmação." },
  { id: "pen-2", texto: "Ainda não caiu. Cobrança aberta: {pendencias} Quer que eu te mande o copia e cola de novo?" },
  { id: "pen-3", texto: "Calmaaa, ainda está pendente. {pendencias} Assim que confirmar, eu te chamo." },
  { id: "pen-4", texto: "Não achei cobrança aberta agora. Se você gerou um QR, me fala o valor que eu olho de novo. Ou quer gerar outro?" },
  { id: "pen-5", texto: "Pendente é isso: gerou, ainda não confirmou. {pendencias} Foto de comprovante não resolve, infelizmente." },
  { id: "pen-6", texto: "Tá em aberto. {pendencias} Quer cancelar a ideia e gerar um valor novo?" },
];

export const confirmados: Fala[] = [
  { id: "cnf-1", texto: "Boa{nome}! O sistema confirmou. {extrato} Saldo agora: R$ {saldo}." },
  { id: "cnf-2", texto: "Caiu sim. {extrato} Saldo: R$ {saldo}. Quer mandar um PIX com isso?" },
  { id: "cnf-3", texto: "Prontinho, depósito confirmado pelo sistema. {extrato} Saldo R$ {saldo}." },
  { id: "cnf-4", texto: "Ainda não tem depósito confirmado nesta conta. Saldo R$ {saldo}. Quer gerar um QR?" },
  { id: "cnf-5", texto: "Última entrada que o sistema registrou: {extrato} Saldo R$ {saldo}." },
  { id: "cnf-6", texto: "Confirmação só vale quando o sistema aponta. Aqui está: {extrato} Saldo R$ {saldo}." },
];

export const transferencias: Fala[] = [
  { id: "trf-1", texto: "Beleza{nome}. Pra transferir eu preciso do valor e da chave ou do número da outra conta LinhaBank. Me passa os dois?" },
  { id: "trf-2", texto: "PIX daqui pra outra conta LinhaBank não tem taxa. Pra fora, eu falo a taxa antes de você confirmar. Qual destino?" },
  { id: "trf-3", texto: "Perfeitooo. Me fala quanto e pra quem. Sem chute: eu só envio depois do seu sim e da confirmação do sistema." },
  { id: "trf-4", texto: "Se for conta LinhaBank, a chave lb ou o número de 8 dígitos já resolve. Qual é o destino?" },
  { id: "trf-5", texto: "Tô contigo. Valor e chave, por favor. Aí eu confirmo tudo antes de mandar." },
  { id: "trf-6", texto: "Não envio no escuro. Me dá valor e destino que a gente revisa juntos." },
  { id: "trf-7", texto: "Show. Se você já tiver a chave, manda ela com o valor. Eu te devolvo o resumo pra você dizer sim." },
];
