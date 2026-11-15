import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { chatDaSessao, operarConta, type PedidoConta, type ResultadoOperacao } from "../lib/banco.js";

const acoes = [
  "resumo",
  "extrato",
  "enviar_pix",
  "transferir",
  "pagar_boleto",
  "bloquear_cartao",
  "desbloquear_cartao",
] as const;

export default defineTool({
  description:
    "Opera a conta LinhaBank deste chat. Saldo e extrato são desta conta, no LinhaBank. Agência, número e chaveTransferencia servem só para transferência entre contas LinhaBank. enviar_pix manda para uma chave de fora e só sai pela gateway. Se o motivo for destino_interno, oriente a usar transferir. Se for gateway_pendente, o saldo não mudou.",
  effect: ({ acao }) => (acao === "resumo" || acao === "extrato" ? "read" : "write"),
  inputSchema: z.object({
    acao: z.enum(acoes).describe("resumo, extrato, enviar_pix, transferir, pagar_boleto, bloquear_cartao ou desbloquear_cartao."),
    valor: z.string().optional().describe("Valor em reais, como 10,50. Obrigatório para PIX, transferência e boleto."),
    chavePix: z.string().optional().describe("Chave PIX de fora, no enviar_pix. Não use a chave interna do LinhaBank."),
    conta: z.string().optional().describe("Número de 8 dígitos ou chave interna da outra conta LinhaBank, na transferência."),
    descricao: z.string().optional().describe("Nome do boleto, no pagar_boleto."),
  }),
  async execute(pedido, ctx): Promise<ResultadoOperacao> {
    const acao = pedido.acao as PedidoConta["acao"];
    return operarConta(ctx.host.kv, chatDaSessao(ctx.session.continuationKey), ctx.session.id, {
      acao,
      valor: pedido.valor,
      chavePix: pedido.chavePix,
      conta: pedido.conta,
      descricao: pedido.descricao,
    });
  },
});
