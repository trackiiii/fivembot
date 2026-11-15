import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { enviarFoto, enviarTexto, registrarTroca } from "../lib/atendimento.js";
import { chatDaSessao, operarConta } from "../lib/banco.js";
import { pngCopiaECola } from "../lib/qr.js";
import { textoDepositoPix } from "../lib/respostas.js";

export default defineTool({
  description:
    "Gera um depósito PIX desta conta, com QR Code e código copia e cola. O QR já sai com a tarifa de recebimento, quando houver. O saldo NÃO sobe neste momento. O valor só entra quando o pagamento for confirmado. Não credite saldo porque o cliente enviou foto, texto ou comprovante. Chame só depois de repetir o valor e ouvir um sim. Nunca fale gateway, webhook ou token.",
  effect: "write",
  inputSchema: z.object({
    valor: z.union([z.string(), z.number()]).describe("Valor em reais, como 50,00."),
  }),
  async execute(pedido, ctx) {
    const valor = typeof pedido.valor === "number" ? pedido.valor.toFixed(2).replace(".", ",") : pedido.valor;
    const chatId = chatDaSessao(ctx.session.continuationKey);
    const resultado = await operarConta(ctx.host.kv, chatId, ctx.session.id, { acao: "depositar", valor });
    if (resultado.ok && resultado.copiaECola !== undefined && chatId !== undefined) {
      const png = await pngCopiaECola(resultado.copiaECola);
      const caption = textoDepositoPix({
        valor: resultado.valor ?? "0,00",
        taxa: resultado.taxa,
        liquido: resultado.liquido,
        copiaECola: resultado.copiaECola,
      });
      const foto = await enviarFoto(chatId, png, caption);
      if (!foto) await enviarTexto(chatId, caption);
      await registrarTroca(ctx.host.kv, chatId, "cliente", `depositar ${valor}`, caption, ctx.session.id);
    }
    const { qrPng: _qr, avisoDestino: _aviso, ...publico } = resultado;
    return publico;
  },
});
