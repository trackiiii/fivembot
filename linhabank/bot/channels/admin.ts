import { defineChannel, GET, POST, localDevStrict, sharedSecretAuth } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";

import { configurarMenuApp, configurarPerfil, enviarTexto } from "../lib/atendimento.js";
import { bloquearConta, confirmarCobrancaSandbox, painelCarteira, reaisDe } from "../lib/banco.js";
import { garantirConfig, gravarConfig } from "../lib/config.js";
import { gatewayConfigurada } from "../lib/gateway.js";
import { emSandbox, modoCarteira } from "../lib/modo.js";
import { pspAtual } from "../lib/psp.js";
import { sqlDisponivel } from "../lib/db.js";

export default defineChannel({
  auth: [
    localDevStrict(),
    sharedSecretAuth({
      header: "x-linhabank-admin-token",
      secret: "ADMIN_TOKEN",
    }),
  ],
  routes: [
    GET("/saude", {
      description: "Estado da carteira, sem dados de cliente.",
      querySchema: z.object({}),
      handler: async (_request, route) => {
        await garantirConfig(route.host.kv);
        return Response.json({
          ok: true,
          nome: "LINHABANK",
          modo: modoCarteira(),
          sql: sqlDisponivel(),
          psp: pspAtual().nome,
          gateway: gatewayConfigurada(),
          producao: false,
        });
      },
    }),
    GET("/estado", {
      description: "Contas, ledger, cobranças e configuração.",
      querySchema: z.object({}),
      handler: async (_request, route) => {
        const config = await garantirConfig(route.host.kv);
        const painel = await painelCarteira(route.host.kv);
        return Response.json({
          ok: true,
          ...painel,
          totalReais: reaisDe(painel.totalCentavos),
          config,
          gateway: gatewayConfigurada(),
          psp: pspAtual().nome,
        });
      },
    }),
    GET("/resumo", {
      description: "JSON do painel administrativo.",
      querySchema: z.object({}),
      handler: async (_request, route) => {
        await garantirConfig(route.host.kv);
        return Response.json(await painelCarteira(route.host.kv));
      },
    }),
    POST("/config", {
      description: "Grava a configuração operacional do LinhaBank.",
      bodySchema: z.unknown(),
      handler: async (_request, route) => {
        const config = await gravarConfig(route.host.kv, route.body);
        await configurarPerfil();
        await configurarMenuApp();
        return Response.json({ ok: true, config });
      },
    }),
    POST("/bloquear", {
      description: "Bloqueia ou libera uma conta.",
      bodySchema: z.object({
        chatId: z.string().min(1).max(32),
        bloquear: z.boolean(),
      }),
      handler: async (_request, route) => {
        const conta = await bloquearConta(route.host.kv, route.body.chatId, route.body.bloquear);
        if (conta === undefined) return Response.json({ ok: false }, { status: 404 });
        return Response.json({ ok: true, status: conta.status, numero: conta.numero });
      },
    }),
    POST("/sandbox/pagar", {
      description: "Simula a confirmação de um depósito. Só existe em sandbox.",
      bodySchema: z.object({
        cobrancaId: z.string().min(4).max(80),
      }),
      handler: async (_request, route) => {
        await garantirConfig(route.host.kv);
        if (!emSandbox()) return Response.json({ ok: false, motivo: "live" }, { status: 403 });
        const resultado = await confirmarCobrancaSandbox(route.host.kv, route.body.cobrancaId);
        if (resultado.estado === "novo") {
          await enviarTexto(resultado.chatId, resultado.texto);
          return Response.json({ ok: true, chatId: resultado.chatId });
        }
        const status = resultado.estado === "conta_ausente" ? 404 : resultado.estado === "valor_invalido" ? 400 : 200;
        return Response.json({ ok: resultado.estado === "repetido", estado: resultado.estado }, { status });
      },
    }),
  ],
});
