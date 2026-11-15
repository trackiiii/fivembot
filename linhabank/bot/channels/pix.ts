import { defineChannel, localDevStrict, POST, sharedSecretAuth } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";

import { avisoDePagamentoAsaas, chaveQrAsaas, lerEventoAsaas, referenciaTransferenciaAsaas } from "../lib/asaas.js";
import { creditarPixRecebido, estornarPixExterno } from "../lib/banco.js";
import { enviarTexto } from "../lib/atendimento.js";
import { registrarTroca } from "../lib/atendimento.js";
import { autorizarRotaPix } from "../lib/segredo.js";

const avisoSchema = z.object({
  id: z.string().min(8).max(80),
  referencia: z.string().regex(/^ref[0-9a-f]{16}$/).optional(),
  valorCentavos: z.number().int().positive(),
  pagador: z.string().max(80).optional(),
  endToEndId: z.string().max(80).optional(),
  txid: z.string().min(8).max(35).optional(),
  cobrancaId: z.string().min(8).max(80).optional(),
});

async function avisarCredito(
  kv: Parameters<typeof creditarPixRecebido>[0],
  aviso: Parameters<typeof creditarPixRecebido>[1],
): Promise<Response> {
  const resultado = await creditarPixRecebido(kv, aviso);
  if (resultado.estado !== "novo") {
    return Response.json({ ok: resultado.estado === "repetido", received: true, estado: resultado.estado });
  }
  await enviarTexto(resultado.chatId, resultado.texto);
  await registrarTroca(kv, resultado.chatId, "cliente", "PIX recebido", resultado.texto, "pix");
  return Response.json({ ok: true, received: true });
}

export default defineChannel({
  auth: [
    localDevStrict(),
    sharedSecretAuth({
      header: "x-linhabank-gateway-token",
      secret: "PIX_GATEWAY_WEBHOOK_SECRET",
    }),
    sharedSecretAuth({
      header: "asaas-access-token",
      secret: "ASAAS_WEBHOOK_TOKEN",
    }),
  ],
  routes: [
    POST("/recebido", {
      description: "A gateway avisa um PIX recebido na conta LinhaBank.",
      bodySchema: avisoSchema,
      handler: async (request, route) => {
        if (!autorizarRotaPix(request, "recebido")) {
          return Response.json({ ok: false }, { status: 401 });
        }
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
    POST("/asaas", {
      description: "Eventos Asaas de PIX recebido e de transferência.",
      bodySchema: z.unknown(),
      handler: async (request, route) => {
        if (!autorizarRotaPix(request, "asaas")) {
          return Response.json({ received: false }, { status: 401 });
        }
        const evento = lerEventoAsaas(route.body);
        if (evento === undefined) return Response.json({ received: true });
        const aviso = avisoDePagamentoAsaas(evento);
        if (aviso !== undefined) {
          if (aviso.cobrancaId === undefined && aviso.pixQrCodeId !== undefined) {
            const id = await route.host.kv.get(chaveQrAsaas(aviso.pixQrCodeId));
            if (typeof id === "string") aviso.cobrancaId = id;
          }
          return avisarCredito(route.host.kv, aviso);
        }
        const referencia = referenciaTransferenciaAsaas(evento);
        if (referencia !== undefined) {
          const estorno = await estornarPixExterno(route.host.kv, referencia);
          if (estorno.estado === "novo" && estorno.chatId !== undefined && estorno.texto !== undefined) {
            await enviarTexto(estorno.chatId, estorno.texto);
            await registrarTroca(route.host.kv, estorno.chatId, "cliente", "PIX estornado", estorno.texto, "pix");
          }
        }
        return Response.json({ received: true });
      },
    }),
  ],
});
