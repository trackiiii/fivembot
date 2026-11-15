import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { registrarTroca, enviarTexto } from "../lib/atendimento.js";
import { chatDaSessao, operarConta, type PedidoConta, type ResultadoOperacao } from "../lib/banco.js";

const acoes = [
  "resumo",
  "extrato",
  "consultar_chave",
  "enviar_pix",
  "transferir",
  "pagar_boleto",
  "bloquear_cartao",
  "desbloquear_cartao",
] as const;

export default defineTool({
  description:
    "Opera a conta LinhaBank deste chat. Antes de enviar_pix, chame consultar_chave com a chave e o valor. Se interno for verdadeiro, a chave é de uma conta LinhaBank: o PIX não tem taxa. Se interno for falso, o campo taxa é a taxa do envio para fora. enviar_pix reconhece a conta LinhaBank sozinho e não cobra taxa nesse caso. Se for gateway_pendente ou gateway_indisponivel, diga só que o PIX não saiu e que o saldo não mudou. Nunca fale ao cliente a palavra gateway, nem referência, webhook ou como a ligação interna funciona.",
  effect: ({ acao }) => (acao === "resumo" || acao === "extrato" || acao === "consultar_chave" ? "read" : "write"),
  inputSchema: z.object({
    acao: z.enum(acoes).describe("resumo, extrato, consultar_chave, enviar_pix, transferir, pagar_boleto, bloquear_cartao ou desbloquear_cartao."),
    valor: z.string().optional().describe("Valor em reais, como 10,50. Obrigatório para PIX, transferência e boleto. Use também em consultar_chave."),
    chavePix: z.string().optional().describe("Chave do destino. Pode ser chave de fora ou chave de conta LinhaBank."),
    conta: z.string().optional().describe("Número de 8 dígitos ou chave da outra conta LinhaBank, na transferência ou na consulta."),
    descricao: z.string().optional().describe("Nome do boleto, no pagar_boleto."),
  }),
  async execute(pedido, ctx): Promise<ResultadoOperacao> {
    const acao = pedido.acao as PedidoConta["acao"];
    const resultado = await operarConta(ctx.host.kv, chatDaSessao(ctx.session.continuationKey), ctx.session.id, {
      acao,
      valor: pedido.valor,
      chavePix: pedido.chavePix,
      conta: pedido.conta,
      descricao: pedido.descricao,
    });
    const aviso = resultado.avisoDestino;
    if (aviso !== undefined) {
      const enviado = await enviarTexto(aviso.chatId, aviso.texto);
      if (enviado) await registrarTroca(ctx.host.kv, aviso.chatId, "cliente", "PIX recebido", aviso.texto, ctx.session.id);
    }
    const { avisoDestino: _aviso, ...publico } = resultado;
    return publico;
  },
});
