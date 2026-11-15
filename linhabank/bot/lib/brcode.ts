import { createHash, randomBytes } from "node:crypto";

function emv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(texto, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function soAscii(valor: string, max: number): string {
  const limpo = valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return (limpo.length > 0 ? limpo : "LINHABANK").slice(0, max);
}

export function novoTxid(): string {
  return `LB${randomBytes(12).toString("hex")}`.slice(0, 25).toUpperCase();
}

export function novoComprovante(): string {
  return `LB-${randomBytes(5).toString("hex").toUpperCase().slice(0, 8)}`;
}

export function hashPayload(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

export function montarCopiaECola(pedido: {
  chave: string;
  valorCentavos: number;
  txid: string;
  nome?: string;
  cidade?: string;
}): string {
  const chave = pedido.chave.trim().slice(0, 77);
  const reais = Math.floor(pedido.valorCentavos / 100);
  const cents = String(pedido.valorCentavos % 100).padStart(2, "0");
  const valor = `${reais}.${cents}`;
  const merchant = emv("00", "br.gov.bcb.pix") + emv("01", chave);
  const adicional = emv("05", pedido.txid.slice(0, 25));
  const corpo =
    emv("00", "01") +
    emv("01", "12") +
    emv("26", merchant) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", valor) +
    emv("58", "BR") +
    emv("59", soAscii(pedido.nome ?? "LINHABANK", 25)) +
    emv("60", soAscii(pedido.cidade ?? "SAO PAULO", 15)) +
    emv("62", adicional);
  const comCrc = `${corpo}6304`;
  return comCrc + crc16(comCrc);
}

export function chaveRecebimento(): string | undefined {
  const chave = process.env.PIX_RECEBIMENTO_CHAVE?.trim() ?? "";
  if (chave.length === 0) return undefined;
  return chave;
}
