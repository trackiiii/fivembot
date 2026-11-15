import { randomInt } from "node:crypto";

import type { Categoria, EstadoFala, Fala, Slots } from "./tipos.js";

export function primeiroNome(nome: string | undefined): string | undefined {
  const pedaco = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (pedaco.length < 2) return undefined;
  if (pedaco.toLowerCase() === "cliente") return undefined;
  return pedaco.slice(0, 24);
}

export function preencher(texto: string, slots: Slots): string {
  const nome = primeiroNome(slots.nome);
  const comNome = nome === undefined ? "" : `, ${nome}`;
  return texto
    .replaceAll("{nome}", comNome)
    .replaceAll("{Nome}", nome ?? "")
    .replaceAll("{saldo}", slots.saldo ?? "")
    .replaceAll("{valor}", slots.valor ?? "")
    .replaceAll("{taxa}", slots.taxa ?? "")
    .replaceAll("{destino}", slots.destino ?? "")
    .replaceAll("{comprovante}", slots.comprovante ?? "")
    .replaceAll("{extrato}", slots.extrato ?? "")
    .replaceAll("{pendencias}", slots.pendencias ?? "")
    .replaceAll("  ", " ")
    .replaceAll(" ,", ",")
    .trim();
}

export function escolherFala(falas: Fala[], estado: EstadoFala, slots: Slots): Fala {
  const nome = primeiroNome(slots.nome);
  const usaveis = falas.filter((fala) => {
    if (fala.id === estado.ultimaId) return false;
    if (nome === undefined && (fala.texto.includes("{nome}") || fala.texto.includes("{Nome}"))) return false;
    if (slots.saldo === undefined && fala.texto.includes("{saldo}")) return false;
    if (slots.valor === undefined && fala.texto.includes("{valor}")) return false;
    if (slots.taxa === undefined && fala.texto.includes("{taxa}")) return false;
    if (slots.extrato === undefined && fala.texto.includes("{extrato}")) return false;
    if (slots.pendencias === undefined && fala.texto.includes("{pendencias}")) return false;
    if (slots.comprovante === undefined && fala.texto.includes("{comprovante}")) return false;
    return true;
  });
  const lista = usaveis.length > 0 ? usaveis : falas.filter((fala) => fala.id !== estado.ultimaId);
  const pool = lista.length > 0 ? lista : falas;
  return pool[randomInt(pool.length)] ?? falas[0] ?? { id: "vazio", texto: "" };
}

export function registrarUso(estado: EstadoFala, categoria: Categoria, falaId: string): EstadoFala {
  return { ...estado, ultimaId: falaId, ultimaCategoria: categoria };
}
