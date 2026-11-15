import { defineChannel, GET, POST, localDevStrict, publicEndpoint } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";

import { executarApp, lerPedidoApp } from "../lib/app/api.js";
import { htmlMiniApp } from "../lib/app/pagina.js";
import { clienteDoPedido } from "../lib/app/init-data.js";

export default defineChannel({
  auth: [localDevStrict(), publicEndpoint()],
  routes: [
    GET("/", {
      description: "Mini-app LinhaBank no Telegram.",
      querySchema: z.object({}),
      handler: async () =>
        new Response(htmlMiniApp(), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        }),
    }),
    POST("/api", {
      description: "Opera a conta do usuário autenticado pelo Telegram WebApp.",
      bodySchema: z.unknown(),
      handler: async (request, route) => {
        const cliente = clienteDoPedido(request);
        if (cliente === undefined) {
          return Response.json({ ok: false, motivo: "nao_autenticado", mensagem: "Abra o app pelo botão LinhaBank no Telegram." }, { status: 401 });
        }
        const pedido = lerPedidoApp(route.body);
        if (pedido === undefined) {
          return Response.json({ ok: false, motivo: "pedido_invalido", mensagem: "Esse pedido não deu certo." }, { status: 400 });
        }
        const corpo = await executarApp(route.host.kv, cliente.chatId, cliente.nome, pedido);
        return Response.json(corpo);
      },
    }),
  ],
});
