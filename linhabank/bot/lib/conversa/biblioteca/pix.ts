import type { Fala } from "../tipos.js";

export const depositos: Fala[] = [
  { id: "dep-1", texto: "Beleza{nome}. Pra o dinheiro entrar eu gero o QR e o copia e cola. Qual valor você quer colocar na conta?" },
  { id: "dep-2", texto: "Vamos receber então. Me fala o valor que eu monto o PIX pra você pagar — ou pra alguém pagar pra você." },
  { id: "dep-3", texto: "Show. Só um recado sincero: o saldo só entra quando o PIX confirmar, não quando a gente gera. Qual valor?" },
  { id: "dep-4", texto: "Me passa o valor, tipo 50,00, que eu te entrego o QR na hora. Sem mistério." },
  { id: "dep-5", texto: "Pode ser. Não precisa me mandar comprovante depois; a confirmação chega sozinha e eu te chamo. Qual valor você quer depositar?" },
  { id: "dep-6", texto: "Opa, depósito. Se você já tiver o valor na cabeça, me manda. Se não, a gente escolhe juntos — 20, 50, 100, o que fizer sentido." },
  { id: "dep-7", texto: "Tá na mão{nome}. Quanto você quer que entre na conta?" },
  { id: "dep-8", texto: "Aaaah, entendi, você quer colocar dinheiro na conta. Me fala quanto que eu monto agora." },
  { id: "dep-9", texto: "Receber PIX eu resolvo. Eu gero o QR e o copia e cola pra cair na sua conta. Qual valor você quer receber?" },
  { id: "dep-10", texto: "Perfeito{nome}. Pra o dinheiro entrar, me fala o valor que eu monto o PIX agora. Pode ser redondo, pode ser quebrado." },
  { id: "dep-11", texto: "Receber na conta, combinado. O saldo só muda depois da confirmação, tá? Quanto você quer receber?" },
  { id: "dep-12", texto: "Vamos botar dinheiro pra dentro. Me diz o valor que eu faço o PIX já com a tarifa, se tiver, pra não ter surpresa na hora de pagar." },
];

export const depositoGerado: Fala[] = [
  { id: "dpg-1", texto: "Fiz o PIX pra você{nome}. Pagar R$ {valor}.{taxa}\n\nÉ só colar no banco:\n{destino}\n\nQuando cair, eu te aviso. Sem print, sem ansiedade." },
  { id: "dpg-2", texto: "Separei o seu depósito. São R$ {valor}.{taxa}\n\nCopia e cola:\n{destino}\n\nPaga quando puder. Eu fico de olho na confirmação." },
  { id: "dpg-3", texto: "Aqui está{nome}. PIX de R$ {valor}.{taxa}\n\nCola isso no app do banco:\n{destino}\n\nPode pagar agora ou daqui a pouco, o código fica aí." },
  { id: "dpg-4", texto: "QR na mão. Valor pra pagar: R$ {valor}.{taxa}\n\n{destino}\n\nNão precisa me mandar comprovante. Se cair, eu te chamo." },
  { id: "dpg-5", texto: "Pronto{nome}. Montei o PIX de R$ {valor}.{taxa}\n\nCopia e cola:\n{destino}\n\nQualquer coisa, me chama. Se quiser outro valor, a gente gera de novo." },
];

export const pendentes: Fala[] = [
  { id: "pen-1", texto: "Olha, tem pagamento em aberto{nome}. {pendencias} O saldo ainda não mudou, tá? Ele só muda na confirmação. Quer que eu te mande o código de novo?" },
  { id: "pen-2", texto: "Ainda não caiu. Cobrança aberta: {pendencias} Se você já pagou, a gente espera. Se não, eu te passo o copia e cola outra vez." },
  { id: "pen-3", texto: "Ainda está pendente, sem drama. {pendencias} Assim que confirmar, eu te chamo. Quer gerar outro valor no lugar?" },
  { id: "pen-4", texto: "Não achei cobrança aberta agora. Se você gerou um QR, me fala o valor que eu olho de novo. Ou quer gerar outro?" },
  { id: "pen-5", texto: "Pendente é isso: gerou, ainda não confirmou. {pendencias} Foto de comprovante não resolve, infelizmente. A gente espera o pagamento." },
  { id: "pen-6", texto: "Tá em aberto. {pendencias} Quer cancelar a ideia e gerar um valor novo, ou a gente segura esse?" },
  { id: "pen-7", texto: "Ainda não entrou. {pendencias} Se você pagou agora há pouco, dá um tempinho. Se não pagou, eu te ajudo a pagar." },
];

export const confirmados: Fala[] = [
  { id: "cnf-1", texto: "Boa{nome}! Caiu. {extrato} Saldo agora: R$ {saldo}. Quer mandar um PIX com isso, ou deixa quieto um pouco?" },
  { id: "cnf-2", texto: "Caiu sim. {extrato} Saldo: R$ {saldo}. Eu fico feliz quando o dinheiro aparece. O que a gente faz agora?" },
  { id: "cnf-3", texto: "Confirmado pelo sistema, sem achismo. {extrato} Saldo R$ {saldo}. Precisa de mais alguma coisa?" },
  { id: "cnf-4", texto: "Ainda não tem depósito confirmado nesta conta. Saldo R$ {saldo}. Quer gerar um QR pra gente começar a entrar dinheiro?" },
  { id: "cnf-5", texto: "Última entrada que o sistema registrou: {extrato} Saldo R$ {saldo}. Se não for essa que você esperava, me conta." },
  { id: "cnf-6", texto: "Confirmação só vale quando o sistema aponta. Aqui está: {extrato} Saldo R$ {saldo}. Quer que eu olhe o extrato inteiro?" },
  { id: "cnf-7", texto: "Olha só, entrou. {extrato} Saldo R$ {saldo}. Se quiser, a gente já manda um PIX pra frente." },
];

export const transferencias: Fala[] = [
  { id: "trf-1", texto: "Beleza{nome}. Pra mandar eu preciso do valor e da chave — ou do número da outra conta LinhaBank. Me passa os dois que eu monto o resumo." },
  { id: "trf-2", texto: "PIX daqui pra outra conta LinhaBank não tem taxa. Pra fora, eu falo a taxa antes de você confirmar, sem pegadinha. Qual destino?" },
  { id: "trf-3", texto: "Me fala quanto e pra quem. Sem chute: eu só envio depois do seu sim e da confirmação do sistema. Pode mandar tudo numa frase." },
  { id: "trf-4", texto: "Se for conta LinhaBank, a chave lb ou o número de 8 dígitos já resolve. Qual é o destino? Depois a gente fala o valor." },
  { id: "trf-5", texto: "Tô contigo. Valor e chave, por favor. Aí eu te devolvo o resumo bonitinho pra você dizer sim ou não." },
  { id: "trf-6", texto: "Não envio no escuro, nem se você tiver pressa. Me dá valor e destino que a gente revisa juntos, um segundo só." },
  { id: "trf-7", texto: "Se você já tiver a chave, manda ela com o valor. Eu te devolvo o resumo pra você dizer sim. Sem surpresa na taxa." },
  { id: "trf-8", texto: "Vamos mandar. Me fala pra quem e quanto. Se for LinhaBank, eu reconheço sozinha. Se for fora, eu aviso a tarifa antes." },
];
