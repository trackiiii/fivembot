import type { HostKvApi } from "@grok/agent-sdk";

import { operarConta, type PedidoConta, type ResultadoOperacao } from "../banco.js";
import { enviarTexto, registrarTroca } from "../atendimento.js";
import { garantirConfig } from "../config.js";
import { modoCarteira } from "../modo.js";
import { pngCopiaECola } from "../qr.js";

const ACOES = ["resumo", "extrato", "depositar", "consultar", "enviar", "cartao"] as const;
type AcaoApp = (typeof ACOES)[number];

export type PedidoApp = {
  acao: AcaoApp;
  valor?: string;
  chave?: string;
  confirmar?: boolean;
  bloquear?: boolean;
};

export type RespostaApp = {
  ok: boolean;
  motivo?: string;
  aberta?: boolean;
  modo: string;
  nome?: string;
  saldo?: string;
  conta?: ResultadoOperacao["conta"];
  extrato?: ResultadoOperacao["extrato"];
  valor?: string;
  destino?: string;
  copiaECola?: string;
  qr?: string;
  interno?: boolean;
  taxa?: string;
  comprovante?: string;
  mensagem?: string;
};

export function lerPedidoApp(corpo: unknown): PedidoApp | undefined {
  if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) return undefined;
  const bruto = corpo as Record<string, unknown>;
  if (typeof bruto.acao !== "string" || !ACOES.includes(bruto.acao as AcaoApp)) return undefined;
  return {
    acao: bruto.acao as AcaoApp,
    valor: typeof bruto.valor === "string" ? bruto.valor : undefined,
    chave: typeof bruto.chave === "string" ? bruto.chave : undefined,
    confirmar: bruto.confirmar === true,
    bloquear: bruto.bloquear === true,
  };
}

export async function executarApp(
  kv: HostKvApi,
  chatId: string,
  nome: string,
  pedido: PedidoApp,
): Promise<RespostaApp> {
  await garantirConfig(kv);
  const modo = modoCarteira();
  if (pedido.acao === "enviar" && pedido.confirmar !== true) {
    return { ok: false, modo, motivo: "precisa_confirmar", mensagem: "Confirme o PIX neste app antes de enviar." };
  }

  const id = idOperacao(chatId, pedido);
  const internoPedido = pedidoParaConta(pedido);
  const resultado = await operarConta(kv, chatId, id, internoPedido);

  if (resultado.avisoDestino !== undefined) {
    const aviso = resultado.avisoDestino;
    const enviado = await enviarTexto(aviso.chatId, aviso.texto);
    if (enviado) await registrarTroca(kv, aviso.chatId, "cliente", "PIX recebido", aviso.texto, id);
  }

  if (resultado.motivo === "sem_conta") {
    return {
      ok: false,
      modo,
      aberta: false,
      motivo: "sem_conta",
      mensagem: "A conta ainda não está aberta. No chat, envie /start e responda CONCORDO.",
    };
  }

  const qr =
    resultado.copiaECola !== undefined && resultado.copiaECola.length > 0
      ? `data:image/png;base64,${Buffer.from(await pngCopiaECola(resultado.copiaECola)).toString("base64")}`
      : undefined;

  if (pedido.acao === "enviar" && resultado.ok) {
    await registrarTroca(kv, chatId, nome, `PIX ${pedido.valor ?? ""}`, "PIX enviado pelo app.", id);
  }

  return {
    ok: resultado.ok,
    modo,
    aberta: true,
    nome,
    motivo: resultado.motivo,
    saldo: resultado.saldo,
    conta: resultado.conta,
    extrato: resultado.extrato,
    valor: resultado.valor,
    destino: resultado.destino,
    copiaECola: resultado.copiaECola,
    qr,
    interno: resultado.interno,
    taxa: resultado.taxa,
    comprovante: resultado.comprovante ?? resultado.endToEndId,
    mensagem: mensagemDe(pedido.acao, resultado),
  };
}

function pedidoParaConta(pedido: PedidoApp): PedidoConta {
  if (pedido.acao === "resumo") return { acao: "resumo" };
  if (pedido.acao === "extrato") return { acao: "extrato" };
  if (pedido.acao === "depositar") return { acao: "depositar", valor: pedido.valor };
  if (pedido.acao === "consultar") return { acao: "consultar_chave", chavePix: pedido.chave, valor: pedido.valor };
  if (pedido.acao === "cartao") return { acao: pedido.bloquear ? "bloquear_cartao" : "desbloquear_cartao" };
  return { acao: "enviar_pix", chavePix: pedido.chave, valor: pedido.valor };
}

function idOperacao(chatId: string, pedido: PedidoApp): string {
  if (pedido.acao === "resumo") return `app:${chatId}:resumo`;
  if (pedido.acao === "extrato") return `app:${chatId}:extrato`;
  const janela = Math.floor(Date.now() / 10_000);
  return `app:${chatId}:${pedido.acao}:${pedido.valor ?? ""}:${pedido.chave ?? ""}:${pedido.bloquear === true ? "1" : "0"}:${janela}`;
}

function mensagemDe(acao: AcaoApp, resultado: ResultadoOperacao): string | undefined {
  if (acao === "consultar" && resultado.ok) {
    if (resultado.interno) return "Conta LinhaBank. Sem taxa.";
    if (resultado.taxa === undefined || resultado.taxa === "0,00") return "PIX para fora. Sem taxa neste momento.";
    return `PIX para fora. Taxa R$ ${resultado.taxa}.`;
  }
  if (acao === "depositar" && resultado.ok && resultado.copiaECola !== undefined) {
    return "Pague este PIX. O saldo só entra depois da confirmação.";
  }
  if (acao === "enviar" && resultado.ok) {
    return resultado.interno ? "PIX enviado para conta LinhaBank. Sem taxa." : "PIX enviado.";
  }
  if (resultado.motivo === "conta_bloqueada") return "Esta conta está bloqueada.";
  if (resultado.motivo === "valor_invalido") return "Esse valor não deu certo. Tenta de novo, tipo 50,00.";
  if (resultado.motivo === "destino_invalido" || resultado.motivo === "chave_ausente") return "Essa chave não deu certo.";
  if (resultado.motivo === "saldo_insuficiente") return "Saldo insuficiente. O valor não saiu.";
  if (resultado.motivo === "gateway_pendente" || resultado.motivo === "gateway_indisponivel") {
    return "O PIX não foi enviado. O saldo permanece o mesmo.";
  }
  if (resultado.motivo === "deposito_pendente") return "Ainda não consegui gerar o QR. O saldo não mudou.";
  if (resultado.motivo === "mesmo_cliente") return "Essa chave é da sua própria conta.";
  if (!resultado.ok) return "Não consegui concluir. O saldo permanece o mesmo.";
  return undefined;
}
