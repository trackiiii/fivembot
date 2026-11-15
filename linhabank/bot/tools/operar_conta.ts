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
    "Opera a conta LinhaBank deste chat. O saldo e o extrato vêm da gateway de PIX, um para cada conta. Use resumo ou extrato antes de falar saldo, chave, agência ou cartão. Se o motivo for gateway_pendente, diga que a gateway ainda não está ligada e não invente número. enviar_pix, transferir e pagar_boleto só depois que o cliente confirmar valor e destino.",
  effect: ({ acao }) => (acao === "resumo" || acao === "extrato" ? "read" : "write"),
  inputSchema: z.object({
    acao: z.enum(acoes).describe("resumo, extrato, enviar_pix, transferir, pagar_boleto, bloquear_cartao ou desbloquear_cartao."),
    valor: z.string().optional().describe("Valor em reais, como 10,50. Obrigatório para PIX, transferência e boleto."),
    chavePix: z.string().optional().describe("Chave PIX de destino, no enviar_pix."),
    conta: z.string().optional().describe("Número da outra conta LinhaBank, com 8 dígitos, na transferência."),
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
