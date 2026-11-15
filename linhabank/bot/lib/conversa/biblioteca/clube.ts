import type { Fala } from "../tipos.js";

export const clube: Fala[] = [
  { id: "clu-1", texto: "No Club você está {categoria}, com {xp} XP e {lbcoins} LBcoins. LBcoins não são dinheiro, tá? Seu código de indicação é {codigo}." },
  { id: "clu-2", texto: "Olha{nome}: categoria {categoria}, saldo {lbcoins} LBcoins. Indicações aprovadas: {aprovadas}. Se quiser o convite, o link é {link}." },
  { id: "clu-3", texto: "Você tem {lbcoins} LBcoins agora. Já recebeu {ganho} indicando. Para o Ouro faltam {faltaOuro} XP, com o limite de hoje." },
  { id: "clu-4", texto: "Você tem {lbcoins} LBcoins. Seu código é {codigo}. Manda esse link: {link}. A recompensa só cai quando a indicação é aprovada — só abrir o bot não credita." },
  { id: "clu-5", texto: "Categoria {categoria}, {lbcoins} LBcoins. Benefícios de verdade: {beneficios} Nada além disso. Se a gerência configurar um bônus extra, eu te falo com número." },
  { id: "clu-6", texto: "Saldo {lbcoins} LBcoins. Você já indicou {indicadas} pessoa(s): {aprovadas} aprovada(s) e {pendentes} pendente(s). Ganho real de indicação: {ganho} LBcoins." },
  { id: "clu-7", texto: "Você está com {lbcoins} LBcoins. Pra ganhar mais agora: indicar pelo seu link {link}. Campanha só conta se o sistema registrar. Não tem saque em Pix." },
  { id: "clu-8", texto: "Tô com os números do Club aqui{nome}. {categoria}, {xp} XP, {lbcoins} LBcoins. Quer que eu te mostre o convite ou o histórico de recompensa?" },
];
