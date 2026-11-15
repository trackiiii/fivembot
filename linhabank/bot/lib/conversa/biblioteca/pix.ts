import type { Fala } from "../tipos.js";

export const depositos: Fala[] = [
  { id: "dep-1", texto: "Beleza{nome}. Pra o dinheiro entrar eu gero o QR e o copia e cola. Qual valor?" },
  { id: "dep-2", texto: "Vamos receber então. Me fala o valor que eu monto o PIX." },
  { id: "dep-3", texto: "Show. O saldo só entra quando o PIX confirmar, não quando a gente gera. Qual valor?" },
  { id: "dep-4", texto: "Me passa o valor, tipo 50,00, que eu te entrego o QR." },
  { id: "dep-5", texto: "Pode ser. Não precisa me mandar comprovante depois; quando cair, eu te chamo. Qual valor?" },
  { id: "dep-6", texto: "Depósito. Se você já tiver o valor, me manda. Se não, a gente escolhe — 20, 50, 100…" },
  { id: "dep-7", texto: "Tá. Quanto você quer que entre na conta{nome}?" },
  { id: "dep-8", texto: "Aaaah, colocar dinheiro na conta. Me fala quanto." },
  { id: "dep-9", texto: "Receber PIX eu resolvo. Qual valor você quer receber?" },
  { id: "dep-10", texto: "Pra o dinheiro entrar, me fala o valor que eu monto agora{nome}." },
  { id: "dep-11", texto: "Receber na conta, combinado. O saldo só muda depois da confirmação. Quanto?" },
  { id: "dep-12", texto: "Vamos botar dinheiro pra dentro. Me diz o valor. Se tiver tarifa, ela já vai no PIX." },
];

export const depositoGerado: Fala[] = [
  { id: "dpg-1", texto: "Fiz o PIX pra você{nome}. Pagar R$ {valor}.{taxa}\n\nÉ só colar no banco:\n{destino}\n\nQuando cair, eu te aviso. Sem print." },
  { id: "dpg-2", texto: "Separei o depósito. São R$ {valor}.{taxa}\n\nCopia e cola:\n{destino}\n\nPaga quando puder. Eu fico de olho." },
  { id: "dpg-3", texto: "Aqui está{nome}. PIX de R$ {valor}.{taxa}\n\nCola isso no app do banco:\n{destino}" },
  { id: "dpg-4", texto: "QR na mão. Valor pra pagar: R$ {valor}.{taxa}\n\n{destino}\n\nNão precisa me mandar comprovante." },
  { id: "dpg-5", texto: "Montei o PIX de R$ {valor}.{taxa}\n\nCopia e cola:\n{destino}\n\nSe quiser outro valor, a gente gera de novo." },
];

export const pendentes: Fala[] = [
  { id: "pen-1", texto: "Tem pagamento em aberto{nome}.\n\n{pendencias}\n\nO saldo ainda não mudou. Quer o código de novo?" },
  { id: "pen-2", texto: "Ainda não caiu.\n\n{pendencias}\n\nSe você já pagou, a gente espera. Se não, eu te passo o copia e cola." },
  { id: "pen-3", texto: "Ainda está pendente.\n\n{pendencias}\n\nAssim que confirmar, eu te chamo." },
  { id: "pen-4", texto: "Não achei cobrança aberta agora. Me fala o valor que você gerou, ou quer gerar outro?" },
  { id: "pen-5", texto: "Gerou e ainda não confirmou.\n\n{pendencias}\n\nFoto de comprovante não resolve. A gente espera o pagamento." },
  { id: "pen-6", texto: "Tá em aberto.\n\n{pendencias}\n\nSegura esse ou gera um valor novo?" },
  { id: "pen-7", texto: "Ainda não entrou.\n\n{pendencias}\n\nSe pagou agora há pouco, dá um tempinho." },
];

export const confirmados: Fala[] = [
  { id: "cnf-1", texto: "Caiu{nome}.\n\n{extrato}\n\nSaldo agora: R$ {saldo}. Quer mandar um PIX com isso?" },
  { id: "cnf-2", texto: "Caiu sim.\n\n{extrato}\n\nSaldo: R$ {saldo}. O que a gente faz agora?" },
  { id: "cnf-3", texto: "Confirmado.\n\n{extrato}\n\nSaldo R$ {saldo}." },
  { id: "cnf-4", texto: "Ainda não tem depósito confirmado. Saldo R$ {saldo}. Quer gerar um QR?" },
  { id: "cnf-5", texto: "Última entrada:\n\n{extrato}\n\nSaldo R$ {saldo}. Se não for essa, me conta." },
  { id: "cnf-6", texto: "Aqui está:\n\n{extrato}\n\nSaldo R$ {saldo}. Quer o extrato inteiro?" },
  { id: "cnf-7", texto: "Olha só, entrou.\n\n{extrato}\n\nSaldo R$ {saldo}." },
];

export const transferencias: Fala[] = [
  { id: "trf-1", texto: "Beleza{nome}. Me passa o valor e a chave — ou o número da outra conta LinhaBank." },
  { id: "trf-2", texto: "PIX pra outra conta LinhaBank não tem taxa. Pra fora, eu falo a tarifa antes. Qual destino?" },
  { id: "trf-3", texto: "Me fala quanto e pra quem. Eu só envio depois do seu sim. Pode mandar numa frase só." },
  { id: "trf-4", texto: "Se for LinhaBank, a chave lb ou o número de 8 dígitos já resolve. Qual é o destino?" },
  { id: "trf-5", texto: "Valor e chave, por favor. Aí eu te devolvo o resumo pra você dizer sim ou não." },
  { id: "trf-6", texto: "Não envio no escuro. Me dá valor e destino que a gente revisa juntos." },
  { id: "trf-7", texto: "Se você já tiver a chave, manda ela com o valor. Eu te devolvo o resumo." },
  { id: "trf-8", texto: "Vamos mandar. Pra quem e quanto? Se for LinhaBank, eu reconheço. Se for fora, eu aviso a tarifa." },
];
