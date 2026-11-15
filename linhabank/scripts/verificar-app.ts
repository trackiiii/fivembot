import { createServer } from "node:http";
import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.TELEGRAM_BOT_TOKEN = "token-mini-app-teste";
process.env.LINHABANK_MODO = "sandbox";
process.env.PIX_RECEBIMENTO_CHAVE = "sandbox@linhabank.test";
delete process.env.LINHABANK_APP_DEV_CHAT;
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;

const { aceitarTermos, creditarPixRecebido } = await import("../bot/lib/banco.js");
const { executarApp } = await import("../bot/lib/app/api.js");
const { clienteDoPedido, montarInitData, validarInitData } = await import("../bot/lib/app/init-data.js");
const { htmlMiniApp } = await import("../bot/lib/app/pagina.js");
const { classificarTexto } = await import("../bot/lib/conversa/index.js");
const { urlDoMiniApp } = await import("../bot/lib/atendimento.js");

function assert(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

function kvMemoria(): HostKvApi {
  const dados = new Map<string, JsonValue>();
  return {
    async get(chave) {
      const valor = dados.get(chave);
      return valor === undefined ? undefined : structuredClone(valor);
    },
    async put(chave, valor) {
      dados.set(chave, structuredClone(valor));
    },
    async delete(chave) {
      dados.delete(chave);
    },
  };
}

{
  const html = htmlMiniApp();
  assert(html.includes("LinhaBank"), "mini-app sem marca");
  assert(html.includes("telegram-web-app.js"), "mini-app sem SDK do Telegram");
  assert(html.includes("/v1/channels/app/api"), "mini-app sem API");
  assert(!html.includes("reply_markup"), "mini-app não pode injetar teclado no chat");
}

{
  const token = "token-mini-app-teste";
  const init = montarInitData(token, { id: 42, first_name: "Ana" });
  const cliente = validarInitData(init, token);
  assert(cliente?.chatId === "42", "initData não autenticou");
  assert(cliente?.nome === "Ana", "initData sem nome");
  const adulterado = init.replace("Ana", "Bia");
  assert(validarInitData(adulterado, token) === undefined, "initData adulterado passou");
}

{
  const token = "token-mini-app-teste";
  const init = montarInitData(token, { id: 7, first_name: "Bia" });
  const request = new Request("https://exemplo.test/v1/channels/app/api", {
    headers: { authorization: `tma ${init}` },
  });
  const cliente = clienteDoPedido(request);
  assert(cliente?.chatId === "7", "header tma não autenticou");
}

{
  process.env.TELEGRAM_WEBAPP_URL = "http://127.0.0.1:3000/v1/channels/app/";
  assert(urlDoMiniApp() === undefined, "HTTP local não pode virar menu do Telegram");
  process.env.TELEGRAM_WEBAPP_URL = "https://banco.exemplo.test/v1/channels/app/";
  assert(urlDoMiniApp() === "https://banco.exemplo.test/v1/channels/app", "URL https do mini-app falhou");
  delete process.env.TELEGRAM_WEBAPP_URL;
}

{
  assert(classificarTexto("abrir o app").categoria === "faq", "abrir o app não foi FAQ");
}

{
  const kv = kvMemoria();
  const sem = await executarApp(kv, "99", "Ana", { acao: "resumo" });
  assert(sem.ok === false && sem.motivo === "sem_conta", "resumo sem conta não recusou");
  assert(!/\d+,\d{2}/.test(sem.saldo ?? ""), "inventou saldo sem conta");
}

{
  const kv = kvMemoria();
  const conta = await aceitarTermos(kv, "42", "Ana Souza");
  await creditarPixRecebido(kv, {
    id: "cred-app-1",
    referencia: conta.referencia,
    valorCentavos: 5000,
    endToEndId: "E2EAPP1",
  });
  const resumo = await executarApp(kv, "42", "Ana", { acao: "resumo" });
  assert(resumo.ok && resumo.saldo === "50,00", "saldo do app não veio do backend");
  const deposito = await executarApp(kv, "42", "Ana", { acao: "depositar", valor: "12,00" });
  assert(deposito.ok && deposito.copiaECola !== undefined, "depósito do app não gerou PIX");
  assert(deposito.qr?.startsWith("data:image/png;base64,") === true, "depósito sem QR");
  const depois = await executarApp(kv, "42", "Ana", { acao: "resumo" });
  assert(depois.saldo === "50,00", "gerar QR creditou saldo");
  const recusa = await executarApp(kv, "42", "Ana", { acao: "enviar", valor: "10,00", chave: "ana@email.com" });
  assert(recusa.ok === false && recusa.motivo === "precisa_confirmar", "PIX saiu sem confirmar");
  const ainda = await executarApp(kv, "42", "Ana", { acao: "resumo" });
  assert(ainda.saldo === "50,00", "PIX sem confirmação mexeu no saldo");
}

{
  const token = "token-mini-app-teste";
  const init = montarInitData(token, { id: 42, first_name: "Ana" });
  const kv = kvMemoria();
  await aceitarTermos(kv, "42", "Ana Souza");
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const chunks: Buffer[] = [];
    for await (const pedaco of req) chunks.push(Buffer.from(pedaco));
    const body = chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const pedido = (await import("../bot/lib/app/api.js")).lerPedidoApp(body);
    const cliente = clienteDoPedido(
      new Request(`http://127.0.0.1${url.pathname}`, { headers: { authorization: req.headers.authorization ?? "" } }),
    );
    if (cliente === undefined) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    if (pedido === undefined) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    const saida = await executarApp(kv, cliente.chatId, cliente.nome, pedido);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(saida));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("servidor de teste não abriu");
  const resposta = await fetch(`http://127.0.0.1:${addr.port}/api`, {
    method: "POST",
    headers: { authorization: `tma ${init}`, "content-type": "application/json" },
    body: JSON.stringify({ acao: "resumo" }),
  });
  const json = (await resposta.json()) as { ok?: boolean; saldo?: string };
  server.close();
  assert(resposta.ok && json.ok === true && json.saldo === "0,00", "API HTTP do app falhou");
}

console.log("app ok");
