import { defineChannel, localDevStrict, POST, sharedSecretAuth } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";

import { creditarPixRecebido } from "../lib/banco.js";
import { enviarTexto } from "../lib/atendimento.js";
import { registrarTroca } from "../lib/atendimento.js";

const avisoSchema = z.object({
  id: z.string().min(8).max(80),
  referencia: z.string().regex(/^ref[0-9a-f]{16}$/).optional(),
  valorCentavos: z.number().int().positive(),
  pagador: z.string().max(80).optional(),
  endToEndId: z.string().max(80).optional(),
  txid: z.string().min(8).max(35).optional(),
  cobrancaId: z.string().min(8).max(80).optional(),
});

export default defineChannel({
  auth: [
    localDevStrict(),
    sharedSecretAuth({
      header: "x-linhabank-gateway-token",
      secret: "PIX_GATEWAY_WEBHOOK_SECRET",
    }),
  ],
  routes: [
    POST("/recebido", {
      description: "A gateway avisa um PIX recebido na conta LinhaBank.",
      bodySchema: avisoSchema,
      handler: async (_request, route) => {
        const aviso = await creditarPixRecebido(route.host.kv, route.body);
        if (aviso.estado !== "novo") {
          if (aviso.estado === "valor_invalido" || aviso.estado === "valor_divergente") {
            return Response.json({ ok: false, estado: aviso.estado }, { status: 400 });
          }
          if (aviso.estado === "conta_ausente") return Response.json({ ok: false }, { status: 404 });
          return Response.json({ ok: true });
        }
        await enviarTexto(aviso.chatId, aviso.texto);
        await registrarTroca(route.host.kv, aviso.chatId, "cliente", "PIX recebido", aviso.texto, "pix");
        return Response.json({ ok: true });
      },
    }),
  ],
});