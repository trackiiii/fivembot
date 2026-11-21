import { randomBytes, randomInt } from "node:crypto";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function novoId(prefixo: string): string {
  return `${prefixo}${randomBytes(8).toString("hex")}`;
}

export function novoCodigoIndicacao(): string {
  let corpo = "";
  for (let i = 0; i < 6; i += 1) corpo += ALFABETO[randomInt(ALFABETO.length)];
  return `LB${corpo}`;
}

export function codigoIndicacaoValido(codigo: string): boolean {
  return /^LB[A-HJ-NP-Z2-9]{6}$/i.test(codigo.trim());
}

export function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}
