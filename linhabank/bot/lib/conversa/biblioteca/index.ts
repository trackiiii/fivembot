import { clube } from "./clube.js";
import { cofrinho } from "./cofrinho.js";
import { cadastro, comprovantes, extratos, faq, linhabank, saldo } from "./conta.js";
import { confirmados, depositoGerado, depositos, pendentes, transferencias } from "./pix.js";
import { agradecimentos, apresentacao, despedidas, informal, saudacoes } from "./sociais.js";
import { impaciente, incompreensao, reclamacoes, seguranca, tecnico } from "./cuidado.js";
import type { Categoria, Fala } from "../tipos.js";

export const BIBLIOTECA: Record<Categoria, Fala[]> = {
  saudacoes,
  apresentacao,
  informal,
  linhabank,
  cadastro,
  saldo,
  depositos,
  pendentes,
  confirmados,
  transferencias,
  extratos,
  comprovantes,
  tecnico,
  seguranca,
  faq,
  reclamacoes,
  impaciente,
  agradecimentos,
  despedidas,
  incompreensao,
  clube,
  cofrinho,
};

export const FALAS_DEPOSITO_GERADO = depositoGerado;

export function falasDa(categoria: Categoria): Fala[] {
  return BIBLIOTECA[categoria];
}

export function contarFalas(): { total: number; porCategoria: Record<Categoria, number> } {
  const porCategoria = {} as Record<Categoria, number>;
  let total = 0;
  for (const [categoria, falas] of Object.entries(BIBLIOTECA) as [Categoria, Fala[]][]) {
    porCategoria[categoria] = falas.length;
    total += falas.length;
  }
  total += depositoGerado.length;
  return { total, porCategoria };
}
