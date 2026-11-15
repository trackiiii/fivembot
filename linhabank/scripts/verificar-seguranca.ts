import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.ADMIN_TOKEN = "token-admin-teste";
process.env.TELEGRAM_BOT_TOKEN = "token-seguranca-teste";
process.env.PIX_GATEWAY_WEBHOOK_SECRET = "segredo-gateway-teste";
process.env.ASAAS_WEBHOOK_TOKEN = "segredo-asaas-teste-32chars-minimo";
process.env.LINHABANK_MODO = "sandbox";
delete process.env.LINHABANK_APP_DEV_CHAT;
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;
delete process.env.LINHABANK_SQL;

const {
  aceitarTermos,
  chatDaSessao,
  creditarPixRecebido,
  confirmarCobrancaSandbox,
  operarConta,
  painelCarteira,
} = await import("../bot/lib/banco.js");
const { aplicarAcao, tentarAbrirAdmin } = await import("../bot/lib/admin/painel.js");
const { garantirConfig, gravarConfig, configAtual } = await import("../bot/lib/config.js");
const { ehAdmin } = await import("../bot/lib/modo.js");
const { interpretarAtualizacao } = await import("../bot/lib/atendimento.js");
const { clienteDoPedido, montarInitData, validarInitData } = await import("../bot/lib/app/init-data.js");
const { executarApp, lerPedidoApp } = await import("../bot/lib/app/api.js");
const { avisoDePagamentoAsaas, lerEventoAsaas } = await import("../bot/lib/asaas.js");
const { autorizarRotaPix, pedidoConfigHttp, tokenConfere } = await import("../bot/lib/segredo.js");
const { responderManutencao } = await import("../bot/lib/manutencao.js");

delete process.env.ASAAS_API_KEY;

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://api.telegram.org/")) {
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`rede bloqueada no teste de segurança: ${new URL(url).host}`);
};

function assert(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

async function saldoDe(kv: HostKvApi, chatId: string): Promise<number> {
  const conta = await operarConta(kv, chatId, `saldo:${chatId}:${Math.random()}`, { acao: "resumo" });
  const [reais, cents] = (conta.saldo ?? "0,00").split(",");
  return Number(reais) * 100 + Number(cents);
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
  const kv = kvMemoria();
  await garantirConfig(kv);
  assert((await tentarAbrirAdmin(kv, "9001")) === "pedir_token", "cliente entrou na gerência sem token");
  assert((await tentarAbrirAdmin(kv, "9001", "x")) === "negado", "token curto passou");
  assert((await tentarAbrirAdmin(kv, "9001", "token-admin-errado")) === "negado", "token errado passou");
  assert(!ehAdmin("9001"), "chat comum virou operador");
  const acao = await aplicarAcao(kv, "9001", "a:g");
  assert((acao.aviso ?? "").includes("restrito"), "ação da gerência sem operador passou");
  assert(acao.tela.texto.includes("restrito"), "tela da gerência abriu para o cliente");
  assert(!ehAdmin("9001"), "callback a:g promoveu o cliente");
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
  const grupo = interpretarAtualizacao({
    update_id: 1,
    message: {
      message_id: 1,
      text: "/admin token-admin-teste",
      chat: { id: -100123, type: "supergroup" },
      from: { first_name: "Ana", is_bot: false },
    },
  });
  assert(grupo.tipo === "ignorar", "comando em grupo não foi ignorado");
  const bot = interpretarAtualizacao({
    update_id: 2,
    message: {
      message_id: 2,
      text: "/admin token-admin-teste",
      chat: { id: 77, type: "private" },
      from: { first_name: "Bot", is_bot: true },
    },
  });
  assert(bot.tipo === "ignorar", "mensagem de bot não foi ignorada");
  const callbackGrupo = interpretarAtualizacao({
    update_id: 3,
    callback_query: {
      id: "cb",
      data: "a:v",
      from: { first_name: "Ana", is_bot: false },
      message: { message_id: 3, chat: { id: -100123, type: "group" } },
    },
  });
  assert(callbackGrupo.tipo === "ignorar", "callback de grupo não foi ignorado");
}

{
  assert(chatDaSessao("tg:77:12") === "77", "chave de sessão válida recusada");
  assert(chatDaSessao("forjado-tg:99:1") === undefined, "chave de sessão forjada passou");
  assert(chatDaSessao("tg:77:12;tg:99:1") === undefined, "chave de sessão composta passou");
  assert(chatDaSessao("99") === undefined, "id solto virou sessão");
}

{
  const kv = kvMemoria();
  const ana = await aceitarTermos(kv, "11", "Ana");
  await aceitarTermos(kv, "22", "Bia");
  await creditarPixRecebido(kv, {
    id: "cred-seg-ana-2",
    referencia: ana.referencia,
    valorCentavos: 10_000,
  });
  const pixBia = await operarConta(kv, "22", "pix-alheio", {
    acao: "enviar_pix",
    valor: "50,00",
    chavePix: ana.chaveInterna,
  });
  assert(pixBia.ok === false, "conta sem saldo enviou PIX");
  assert((await saldoDe(kv, "11")) === 10_000, "PIX alheio mexeu no saldo da Ana");
  assert((await saldoDe(kv, "22")) === 0, "tentativa de PIX inventou saldo");
  const resumoBia = await operarConta(kv, "22", "resumo-bia", { acao: "resumo" });
  assert(resumoBia.saldo === "0,00", "Bia viu saldo de outra conta");
}

{
  const kv = kvMemoria();
  const ana = await aceitarTermos(kv, "33", "Ana");
  const ausente = await creditarPixRecebido(kv, {
    id: "pay_inventado_123",
    valorCentavos: 99_000_00,
  });
  assert(ausente.estado === "conta_ausente", "crédito sem cobrança e sem referência passou");
  const refErrada = await creditarPixRecebido(kv, {
    id: "pay_ref_errada_1",
    referencia: "ref0000000000000000",
    valorCentavos: 5_000,
  });
  assert(refErrada.estado === "conta_ausente", "crédito com referência inventada passou");
  const deposito = await operarConta(kv, "33", "dep-seg", { acao: "depositar", valor: "20,00" });
  assert(deposito.ok === true && deposito.destino !== undefined, "depósito de teste falhou");
  const divergente = await creditarPixRecebido(kv, {
    id: "pay_div_123456",
    cobrancaId: deposito.destino,
    valorCentavos: 1,
  });
  assert(divergente.estado === "valor_divergente", "valor divergente creditou");
  const cobranca = (await painelCarteira(kv)).cobrancas.find((item) => item.id === deposito.destino);
  assert(cobranca !== undefined, "cobrança do depósito não apareceu");
  const primeiro = await creditarPixRecebido(kv, {
    id: "pay_ok_1234567",
    cobrancaId: deposito.destino,
    valorCentavos: cobranca!.valorCentavos,
  });
  assert(primeiro.estado === "novo", "crédito válido não entrou");
  const repetido = await creditarPixRecebido(kv, {
    id: "pay_ok_1234567",
    cobrancaId: deposito.destino,
    valorCentavos: cobranca!.valorCentavos,
  });
  assert(repetido.estado === "repetido", "webhook repetido creditou de novo");
}

{
  assert(avisoDePagamentoAsaas({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_abcdefg1", value: 50 } }) === undefined, "PAYMENT_CONFIRMED creditou");
  assert(avisoDePagamentoAsaas({ event: "PAYMENT_CREATED", payment: { id: "pay_abcdefg2", value: 50, billingType: "PIX" } }) === undefined, "PAYMENT_CREATED creditou");
  assert(lerEventoAsaas({ event: "PAYMENT_RECEIVED", payment: { id: { $gt: "" } } }) === undefined, "payload Asaas não sanitizado");
  const gateway = new Request("https://banco.test/v1/channels/pix/recebido", {
    headers: { "asaas-access-token": process.env.ASAAS_WEBHOOK_TOKEN ?? "" },
  });
  assert(autorizarRotaPix(gateway, "recebido") === false, "token Asaas autenticou a rota da gateway");
  const asaas = new Request("https://banco.test/v1/channels/pix/asaas", {
    headers: { "x-linhabank-gateway-token": process.env.PIX_GATEWAY_WEBHOOK_SECRET ?? "" },
  });
  assert(autorizarRotaPix(asaas, "asaas") === false, "token da gateway autenticou a rota Asaas");
  const certoRecebido = new Request("https://banco.test/v1/channels/pix/recebido", {
    headers: { "x-linhabank-gateway-token": process.env.PIX_GATEWAY_WEBHOOK_SECRET ?? "" },
  });
  assert(autorizarRotaPix(certoRecebido, "recebido") === true, "token certo da gateway recusado");
  const certoAsaas = new Request("https://banco.test/v1/channels/pix/asaas", {
    headers: { "asaas-access-token": process.env.ASAAS_WEBHOOK_TOKEN ?? "" },
  });
  assert(autorizarRotaPix(certoAsaas, "asaas") === true, "token certo Asaas recusado");
  const vazio = new Request("https://banco.test/v1/channels/pix/asaas");
  assert(autorizarRotaPix(vazio, "asaas") === false, "rota Asaas sem token passou");
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
  await gravarConfig(kv, { modo: "sandbox", chatsAdmin: "1001" });
  const sanitizado = pedidoConfigHttp({
    modo: "live",
    chatsAdmin: "999999999",
    taxaCentavos: 150,
    manutencao: true,
  });
  assert(!("modo" in sanitizado), "HTTP ainda envia modo");
  assert(!("chatsAdmin" in sanitizado), "HTTP ainda envia operadores");
  const depois = await gravarConfig(kv, sanitizado);
  assert(depois.modo === "sandbox", "HTTP colocou produção");
  assert(!depois.chatsAdmin.split(",").includes("999999999"), "HTTP cadastrou operador");
  assert(depois.taxaCentavos === 150, "HTTP não gravou tarifa permitida");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "44", "Ana");
  const deposito = await operarConta(kv, "44", "dep-live", { acao: "depositar", valor: "10,00" });
  await gravarConfig(kv, { modo: "live" });
  const sandbox = await confirmarCobrancaSandbox(kv, deposito.destino ?? "");
  assert(sandbox.estado === "live", "simulação sandbox creditou em produção");
  await gravarConfig(kv, { modo: "sandbox" });
}

{
  const token = "token-seguranca-teste";
  const init = montarInitData(token, { id: 55, first_name: "Ana" });
  assert(validarInitData(init, "outro-token-bot") === undefined, "initData de outro bot passou");
  assert(validarInitData("", token) === undefined, "initData vazio passou");
  assert(validarInitData(init.replace(/hash=[0-9a-f]+/i, "hash=" + "0".repeat(64)), token) === undefined, "hash zerado passou");
  const velho = montarInitData(token, { id: 55, first_name: "Ana" }, Math.floor(Date.now() / 1000) - 90_000);
  assert(validarInitData(velho, token) === undefined, "initData expirado passou");
  const futuro = montarInitData(token, { id: 55, first_name: "Ana" }, Math.floor(Date.now() / 1000) + 3_600);
  assert(validarInitData(futuro, token) === undefined, "initData no futuro passou");
  const semAuth = clienteDoPedido(new Request("https://banco.test/v1/channels/app/api"));
  assert(semAuth === undefined, "API do app sem token autenticou");
  const pedido = lerPedidoApp({ acao: "enviar", chatId: "1", valor: "10,00", chave: "ana@email.com", confirmar: true });
  assert(pedido !== undefined && !Object.prototype.hasOwnProperty.call(pedido, "chatId"), "chatId do corpo vazou para o pedido");
}

{
  const kv = kvMemoria();
  const ana = await aceitarTermos(kv, "66", "Ana");
  await creditarPixRecebido(kv, { id: "cred-app-seg-2", referencia: ana.referencia, valorCentavos: 8_000 });
  const semConfirmar = await executarApp(kv, "66", "Ana", { acao: "enviar", valor: "10,00", chave: "fora@email.com" });
  assert(semConfirmar.ok === false && semConfirmar.motivo === "precisa_confirmar", "PIX do app saiu sem confirmar");
  const outro = await executarApp(kv, "66", "Ana", { acao: "resumo" });
  assert(outro.saldo === "80,00", "app debitou sem confirmação");
  const alheio = await executarApp(kv, "77", "Invasor", { acao: "resumo" });
  assert(alheio.ok === false && alheio.motivo === "sem_conta", "app operou conta sem autenticação de sessão");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "88", "Ana");
  await gravarConfig(kv, { manutencao: true, chatsAdmin: "1001" });
  const bloqueado = await responderManutencao(kv, { chatId: "88" });
  assert(bloqueado === true, "manutenção não bloqueou o cliente");
  const operador = await responderManutencao(kv, { chatId: "1001" });
  assert(operador === false, "manutenção bloqueou o operador");
  const app = await executarApp(kv, "88", "Ana", { acao: "resumo" });
  assert(app.ok === false && app.motivo === "manutencao", "app funcionou em manutenção");
  await gravarConfig(kv, { manutencao: false });
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "88", "Ana");
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const desativada = await aplicarAcao(kv, "1001", "a:b:0");
  assert((desativada.aviso ?? "").includes("desativada"), "desativar no teste de invasão falhou");
  const pix = await operarConta(kv, "88", "pix-morta", {
    acao: "enviar_pix",
    valor: "1,00",
    chavePix: "ana@email.com",
  });
  assert(pix.ok === false && pix.motivo === "conta_bloqueada", "conta desativada enviou PIX");
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
  const poluido = await gravarConfig(kv, {
    __proto__: { modo: "live" },
    constructor: { prototype: { modo: "live" } },
    taxaCentavos: "150",
    chatsAdmin: "abc,1;drop table contas",
  });
  assert(poluido.modo === "sandbox", "poluição de protótipo mudou o modo");
  assert(configAtual().modo === "sandbox", "overlay global ficou em live");
  assert(!poluido.chatsAdmin.includes("abc"), "id de operador inválido gravou");
}

{
  assert(tokenConfere("token-admin-teste", "token-admin-teste") === true, "token igual falhou");
  assert(tokenConfere("token-admin-teste", "token-admin-errado") === false, "token diferente passou");
  assert(tokenConfere("", "token-admin-teste") === false, "token vazio passou");
}

{
  const rastreado = execFileSync("git", ["ls-files", ".env", ".env.local", "linhabank/.env", "linhabank/.env.local"], {
    cwd: "/workspace",
    encoding: "utf8",
  }).trim();
  assert(rastreado.length === 0, `segredo versionado: ${rastreado}`);
  const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
  assert(gitignore.includes(".env.local"), ".env.local fora do gitignore");
  const agentes = readFileSync(new URL("../bot/agent.ts", import.meta.url), "utf8");
  assert(!/\$aact_/.test(agentes), "chave Asaas no agent.ts");
}

console.log("seguranca ok");
