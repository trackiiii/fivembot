import { defineChannel, localDevStrict, POST, sharedSecretAuth } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";

import { confirmarAvisoPix, prepararAvisoPix } from "../lib/banco.js";
import { enviarTexto } from "../lib/atendimento.js";

const avisoSchema = z.object({
  id: z.string().min(8).max(80),
  conta: z.string().regex(/^\d{8}$/),
  valorCentavos: z.number().int().positive(),
  pagador: z.string().max(80).optional(),
  endToEndId: z.string().max(80).optional(),
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
        const aviso = await prepararAvisoPix(route.host.kv, route.body);
        if (aviso.estado !== "novo") {
          if (aviso.estado === "valor_invalido") return Response.json({ ok: false }, { status: 400 });
          if (aviso.estado === "conta_ausente") return Response.json({ ok: false }, { status: 404 });
          return Response.json({ ok: true });
        }
        const enviado = await enviarTexto(aviso.chatId, aviso.texto);
        if (!enviado) return Response.json({ ok: false }, { status: 503 });
        await confirmarAvisoPix(route.host.kv, route.body.id);
        return Response.json({ ok: true });
      },
    }),
  ],
});