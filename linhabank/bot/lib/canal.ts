import type { HostKvApi } from "@grok/agent-sdk";

import { configAtual } from "./config.js";
import { chatsAdmin } from "./modo.js";

export type ContaCanal = {
  nome: string;
  numero: string;
  agencia: string;
};

export type EventoCanal =
  | {
      id: string;
      tipo: "deposito_gerado";
      conta: ContaCanal;
      valorCentavos: number;
      cobrancaId: string;
    }
  | {
      id: string;
      tipo: "deposito_recebido";
      conta: ContaCanal;
      valorCentavos: number;
      comprovante?: string;
      origem?: string;
    }
  | {
      id: string;
      tipo: "pix_enviado" | "transferencia_enviada";
      conta: ContaCanal;
      valorCentavos: number;
      destino: string;
      interno: boolean;
      taxaCentavos?: number;
      comprovante?: string;
    }
  | {
      id: string;
      tipo: "pix_recebido" | "transferencia_recebida";
      conta: ContaCanal;
      valorCentavos: number;
      origem?: string;
      comprovante?: string;
    };

export function idCanalValido(id: string): boolean {
  const limpo = id.trim();
  return /^-?\d{5,20}$/.test(limpo) || /^@[A-Za-z0-9_]{5,32}$/.test(limpo);
}

export function destinosCanal(): string[] {
  const canal = configAtual().canalMovimento.trim();
  if (idCanalValido(canal)) return [canal];
  return chatsAdmin();
}

export function canalSilenciado(): boolean {
  return process.env.LINHABANK_SILENCIO_CANAL === "1";
}

export function textoMovimentoCanal(evento: EventoCanal): string {
  const valor = `R$ ${reais(evento.valorCentavos)}`;
  const titular = `${evento.conta.agencia} / ${evento.conta.numero}  ·  ${evento.conta.nome}`;
  if (evento.tipo === "deposito_gerado") {
    return linhas("Depósito gerado", [`Conta ${titular}`, `Valor ${valor}`, `Cobrança ${evento.cobrancaId}`]);
  }
  if (evento.tipo === "deposito_recebido") {
    return linhas("Depósito recebido", [
      `Conta ${titular}`,
      `Valor ${valor}`,
      evento.origem ? `Origem ${evento.origem}` : "",
      evento.comprovante ? `Comprovante ${evento.comprovante}` : "",
    ]);
  }
  if (evento.tipo === "pix_enviado" || evento.tipo === "transferencia_enviada") {
    const titulo = evento.tipo === "pix_enviado" ? "PIX enviado" : "Transferência enviada";
    const via = evento.interno ? "LinhaBank" : "externo";
    const tarifa =
      evento.tipo === "pix_enviado"
        ? evento.interno || (evento.taxaCentavos ?? 0) === 0
          ? "Tarifa isenta"
          : `Tarifa R$ ${reais(evento.taxaCentavos ?? 0)}`
        : "";
    return linhas(`${titulo} (${via})`, [
      `Conta ${titular}`,
      `Destino ${evento.destino}`,
      `Valor ${valor}`,
      tarifa,
      evento.comprovante ? `Comprovante ${evento.comprovante}` : "",
    ]);
  }
  if (evento.tipo === "pix_recebido" || evento.tipo === "transferencia_recebida") {
    const titulo = evento.tipo === "pix_recebido" ? "PIX recebido" : "Transferência recebida";
    return linhas(titulo, [
      `Conta ${titular}`,
      evento.origem ? `Origem ${evento.origem}` : "",
      `Valor ${valor}`,
      evento.comprovante ? `Comprovante ${evento.comprovante}` : "",
    ]);
  }
  return linhas("Movimento", [`Conta ${titular}`, `Valor ${valor}`]);
}

export async function avisarCanalMovimento(kv: HostKvApi, evento: EventoCanal): Promise<void> {
  if (canalSilenciado()) return;
  try {
    const marca = `linhabank:canal:aviso:${evento.id}`;
    if ((await kv.get(marca)) !== undefined) return;
    await kv.put(marca, true);
    const destinos = destinosCanal();
    if (destinos.length === 0) return;
    const texto = textoMovimentoCanal(evento);
    const { enviarMensagem } = await import("./atendimento.js");
    for (const chatId of destinos) {
      await enviarMensagem(chatId, texto, { prefixo: false });
    }
  } catch {
    /* o ledger já fechou; falha no canal não desfaz a operação */
  }
}

function linhas(titulo: string, corpo: string[]): string {
  return ["LINHABANK  ·  movimento", titulo, "", ...corpo.filter((item) => item.length > 0)].join("\n");
}

function reais(centavos: number): string {
  const n = Math.abs(Math.trunc(centavos));
  return `${Math.floor(n / 100)},${String(n % 100).padStart(2, "0")}`;
}
