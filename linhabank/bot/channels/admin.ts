import { defineChannel, GET, POST, localDevStrict, sharedSecretAuth } from "@grok/agent-sdk/channels";
import * as z from "zod/v4";

import { enviarTexto } from "../lib/atendimento.js";
import { bloquearConta, confirmarCobrancaSandbox, painelCarteira, reaisDe } from "../lib/banco.js";
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
      handler: async () =>
        Response.json({
          ok: true,
          nome: "LINHABANK",
          modo: modoCarteira(),
          sql: sqlDisponivel(),
          psp: pspAtual().nome,
          producao: false,
        }),
    }),
    GET("/painel", {
      description: "Painel administrativo da carteira.",
      querySchema: z.object({}),
      handler: async (_request, route) => {
        const painel = await painelCarteira(route.host.kv);
        return new Response(htmlPainel(painel), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    }),
    GET("/resumo", {
      description: "JSON do painel administrativo.",
      querySchema: z.object({}),
      handler: async (_request, route) => Response.json(await painelCarteira(route.host.kv)),
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

function htmlPainel(painel: Awaited<ReturnType<typeof painelCarteira>>): string {
  const contas = painel.contas
    .map(
      (conta) =>
        `<tr><td>${esc(conta.numero)}</td><td>${esc(conta.nome)}</td><td>R$ ${esc(conta.saldo)}</td><td>${esc(conta.status)}</td><td>${esc(conta.chatId)}</td></tr>`,
    )
    .join("");
  const ledger = painel.ledger
    .map(
      (item) =>
        `<tr><td>${esc(item.em)}</td><td>${esc(item.tipo)}</td><td>R$ ${esc(item.valor)}</td><td>${esc(item.conta)}</td><td>${esc(item.comprovante ?? "")}</td></tr>`,
    )
    .join("");
  const cobrancas = painel.cobrancas
    .map(
      (item) =>
        `<tr><td>${esc(item.id)}</td><td>R$ ${esc(item.valor)}</td><td>${esc(item.status)}</td><td>${esc(item.txid)}</td></tr>`,
    )
    .join("");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>LINHABANK admin</title>
<style>
body{font-family:sans-serif;margin:24px;color:#111;background:#f6f6f4}
h1,h2{font-weight:600}
table{border-collapse:collapse;width:100%;background:#fff}
td,th{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
.aviso{padding:12px;background:#fff3cd;border:1px solid #e6d08a;margin:12px 0}
</style></head>
<body>
<h1>LINHABANK</h1>
<p>Modo ${esc(painel.sql ? "SQL" : "KV")} · saldo agregado R$ ${esc(reaisDe(painel.totalCentavos))}</p>
<div class="aviso">Ambiente de teste. Não processe dinheiro real sem gateway, segurança e estrutura regulatória.</div>
<h2>Contas</h2>
<table><tr><th>Número</th><th>Nome</th><th>Saldo</th><th>Status</th><th>Chat</th></tr>${contas}</table>
<h2>Ledger</h2>
<table><tr><th>Quando</th><th>Tipo</th><th>Valor</th><th>Conta</th><th>Comprovante</th></tr>${ledger}</table>
<h2>Cobranças PIX</h2>
<table><tr><th>Id</th><th>Valor</th><th>Status</th><th>txid</th></tr>${cobrancas}</table>
</body></html>`;
}

function esc(valor: string): string {
  return valor.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);
}
