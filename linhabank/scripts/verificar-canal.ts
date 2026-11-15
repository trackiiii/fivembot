import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.TELEGRAM_BOT_TOKEN = "token-canal-teste";
process.env.LINHABANK_CANAL_MOVIMENTO = "-1001234567890";
process.env.PIX_GATEWAY_URL = "https://pix.example.test";
process.env.PIX_GATEWAY_TOKEN = "token-de-teste";
process.env.PIX_RECEBIMENTO_CHAVE = "sandbox@linhabank.test";
process.env.LINHABANK_MODO = "sandbox";
delete process.env.LINHABANK_SILENCIO_CANAL;
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;
delete process.env.LINHABANK_SQL;

type PostTelegram = { metodo: string; chatId: string; text: string };

const telegram: PostTelegram[] = [];
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://pix.example.test/")) {
    return new Response(JSON.stringify({ ok: true, endToEndId: "E2EEXTERNO1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  const telegramUrl = url.match(/^https:\/\/api\.telegram\.org\/bottoken-canal-teste\/(\w+)$/);
  if (telegramUrl !== null) {
    const corpo = typeof init?.body === "string" ? (JSON.parse(init.body) as { chat_id?: string; text?: string }) : {};
    telegram.push({
      metodo: telegramUrl[1] ?? "",
      chatId: String(corpo.chat_id ?? ""),
      text: String(corpo.text ?? ""),
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: telegram.length } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`rede bloqueada no teste: ${new URL(url).host}`);
};

const { aceitarTermos, creditarPixRecebido, operarConta } = await import("../bot/lib/banco.js");
const {
  destinosCanal,
  idCanalValido,
  textoMovimentoCanal,
} = await import("../bot/lib/canal.js");
const { gravarConfig, configAtual } = await import("../bot/lib/config.js");

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

function textos(): string[] {
  return telegram.filter((item) => item.metodo === "sendMessage").map((item) => item.text);
}

{
  assert(idCanalValido("-1001234567890"), "id de canal numérico recusado");
  assert(idCanalValido("@LinhaBankOps"), "username de canal recusado");
  assert(!idCanalValido("abc"), "id inválido aceito");
  assert(destinosCanal().join(",") === "-1001234567890", `destino padrão ${destinosCanal().join(",")}`);
  const gerado = textoMovimentoCanal({
    id: "t1",
    tipo: "deposito_gerado",
    conta: { nome: "Ana Silva", numero: "0001", agencia: "0001" },
    valorCentavos: 2500,
    cobrancaId: "dep-abc",
  });
  assert(gerado.includes("Depósito gerado"), "texto sem depósito gerado");
  assert(gerado.includes("R$ 25,00"), "texto sem valor");
  assert(!gerado.includes("000201"), "texto levou copia e cola");
  assert(!/thialinha/i.test(gerado), "texto do canal com Thialinha");
  const enviado = textoMovimentoCanal({
    id: "t2",
    tipo: "pix_enviado",
    conta: { nome: "Ana Silva", numero: "0001", agencia: "0001" },
    valorCentavos: 1000,
    destino: "ana@email.com",
    interno: false,
    taxaCentavos: 150,
    comprovante: "LB-TESTE",
  });
  assert(enviado.includes("PIX enviado (externo)"), "envio externo sem rótulo");
  assert(enviado.includes("Tarifa R$ 1,50"), "envio externo sem tarifa");
}

{
  const kv = kvMemoria();
  const ana = await aceitarTermos(kv, "11", "Ana Silva");
  const bia = await aceitarTermos(kv, "22", "Bia Souza");
  telegram.length = 0;
  const deposito = await operarConta(kv, "11", "dep-canal", { acao: "depositar", valor: "25,00" });
  assert(deposito.ok === true && deposito.destino !== undefined, "depósito de teste falhou");
  assert(textos().some((item) => item.includes("Depósito gerado") && item.includes(ana.numero)), "canal sem depósito gerado");
  assert(telegram.every((item) => item.chatId === "-1001234567890"), "post foi para outro chat");
  assert(textos().every((item) => !item.includes("000201") && !/thialinha/i.test(item)), "canal vazou copia e cola");

  const pago = await creditarPixRecebido(kv, {
    id: "wh-canal-dep",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 2_500,
    pagador: "João",
  });
  assert(pago.estado === "novo", "webhook do depósito não creditou");
  assert(textos().some((item) => item.includes("Depósito recebido") && item.includes("João")), "canal sem depósito recebido");

  await creditarPixRecebido(kv, {
    id: "wh-canal-saldo",
    referencia: ana.referencia,
    valorCentavos: 10_000,
    pagador: "Crédito teste",
  });
  assert(textos().some((item) => item.includes("PIX recebido")), "canal sem PIX recebido");

  const interno = await operarConta(kv, "11", "pix-canal-interno", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: bia.chaveInterna,
  });
  assert(interno.ok === true, "PIX interno falhou");
  assert(textos().some((item) => item.includes("PIX enviado (LinhaBank)") && item.includes(bia.numero)), "canal sem envio interno");
  assert(textos().some((item) => item.includes("PIX recebido") && item.includes(bia.numero)), "canal sem recebimento interno");

  const externo = await operarConta(kv, "11", "pix-canal-externo", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
  });
  assert(externo.ok === true, "PIX externo falhou");
  assert(textos().some((item) => item.includes("PIX enviado (externo)") && item.includes("ana@email.com")), "canal sem envio externo");

  const antes = telegram.length;
  await creditarPixRecebido(kv, {
    id: "wh-canal-dep",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 2_500,
  });
  assert(telegram.length === antes, "webhook repetido postou de novo no canal");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { canalMovimento: "" });
  assert(configAtual().canalMovimento === "", "limpar canal não gravou");
  assert(destinosCanal().includes("7069054484"), "sem canal configurado não cai nos operadores");
  await gravarConfig(kv, { canalMovimento: "@LinhaBankOps" });
  assert(destinosCanal().join(",") === "@LinhaBankOps", "username do canal não virou destino");
}

console.log("canal ok");
