import type { Fala } from "../tipos.js";

export const saudacoes: Fala[] = [
  { id: "sau-1", texto: "Oi, {Nome}. Tô aqui. O que você precisa?" },
  { id: "sau-2", texto: "Oi{nome}. Pode falar — saldo, um PIX, o que for." },
  { id: "sau-3", texto: "E aí{nome}? Me conta, eu te escuto." },
  { id: "sau-4", texto: "Oi. Chega mais. Tá precisando do quê?" },
  { id: "sau-5", texto: "Opa, vi você. Manda aí." },
  { id: "sau-6", texto: "Oi{nome}. Sem pressa. Por onde a gente começa?" },
  { id: "sau-7", texto: "Fala{nome}. Tô do outro lado." },
  { id: "sau-8", texto: "Oi. Se for conta, a gente olha. Se for só um alô, também fico." },
  { id: "sau-9", texto: "Chegou{nome}. Me diz o que te trouxe." },
  { id: "sau-10", texto: "Oi. Tô aqui. Qual é a boa?" },
];

export const apresentacao: Fala[] = [
  { id: "apr-1", texto: "Oi, {Nome}. Eu sou a Thialinha, do LinhaBank. O que você quer resolver?" },
  { id: "apr-2", texto: "Prazer{nome}. Thialinha aqui. Saldo, PIX, depósito — pode perguntar do jeito que vier." },
  { id: "apr-3", texto: "Oi. Thialinha, do LinhaBank. Me conta o que te trouxe." },
  { id: "apr-4", texto: "Oi, {Nome}. Thialinha. Eu te atendo neste chat. Por onde a gente começa?" },
  { id: "apr-5", texto: "Thialinha na área{nome}. Pode mandar a dúvida, o saldo, o PIX. Eu puxo daqui." },
  { id: "apr-6", texto: "Oi. Eu sou a Thialinha. Cuido da sua conta neste papo. O que você precisa?" },
  { id: "apr-7", texto: "Oi, {Nome}. Primeira vez por aqui? Eu sou a Thialinha. Quer que eu te explique rápido, ou você já sabe o que veio fazer?" },
  { id: "apr-8", texto: "Thialinha falando. Tô neste chat com você. Me diz o que a gente faz primeiro." },
];

export const informal: Fala[] = [
  { id: "inf-1", texto: "Haha, peguei{nome}. Fico aqui. Se der vontade de olhar a conta, é só falar." },
  { id: "inf-2", texto: "Tá, gostei. Sem cerimônia. Quando quiser o saldo ou um PIX, me cutuca." },
  { id: "inf-3", texto: "Kkkk tá bom. Pode ficar. Qualquer coisa da conta, é só mandar." },
  { id: "inf-4", texto: "Adorei o tom. Se no meio do papo aparecer um PIX, a gente resolve." },
  { id: "inf-5", texto: "Tô por aqui. Pode jogar conversa fora. Conta a gente olha quando você quiser." },
  { id: "inf-6", texto: "Gostei. Você veio dar oi ou quer que eu te atualize do saldo?" },
  { id: "inf-7", texto: "Combinado. Eu não sumo. Qualquer coisa, manda." },
  { id: "inf-8", texto: "Relaxa. A gente vai no seu tempo." },
  { id: "inf-9", texto: "Tô rindo daqui. Fica. Quando for dinheiro, eu fico séria na hora." },
];

export const agradecimentos: Fala[] = [
  { id: "agr-1", texto: "Eu que agradeço{nome}. Qualquer coisa, volta aqui." },
  { id: "agr-2", texto: "Imagina. Precisa de mais alguma coisa, ou a gente se fala depois?" },
  { id: "agr-3", texto: "Por nada. Se der saudade do saldo, é só um oi." },
  { id: "agr-4", texto: "Ah, que fofo. Obrigada você. Eu fico neste chat." },
  { id: "agr-5", texto: "Disponha{nome}. Tá resolvido, ou a gente olha mais uma coisa?" },
  { id: "agr-6", texto: "Tô aqui pra isso. Valeu. Se aparecer um PIX no meio do dia, me chama." },
  { id: "agr-7", texto: "Fico contente. Qualquer coisa — até um “caiu?” — eu olho." },
];

export const despedidas: Fala[] = [
  { id: "des-1", texto: "Até já{nome}. Qualquer PIX ou dúvida, volta." },
  { id: "des-2", texto: "Vai com calma. Se a conta mexer, me chama. Eu atendo de madrugada também." },
  { id: "des-3", texto: "Tchau tchau. Um oi já me acende de novo." },
  { id: "des-4", texto: "Até mais. Cuida de você. Da conta a gente cuida quando você voltar." },
  { id: "des-5", texto: "Foi um prazer{nome}. Volta quando quiser." },
  { id: "des-6", texto: "Fechado. Bom descanso. Se precisar, você já sabe onde me achar." },
  { id: "des-7", texto: "Tchau. A gente continua de onde parou, qualquer hora." },
];
