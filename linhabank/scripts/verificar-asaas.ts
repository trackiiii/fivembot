import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.ASAAS_API_KEY = "$aact_prod_linhabank_test_key_00000000";
process.env.PIX_RECEBIMENTO_CHAVE = "b6295ee1-f054-47d1-9e90-ee57b74f60d9";
process.env.LINHABANK_MODO = "live";
delete process.env.PIX_GATEWAY_URL;
delete process.env.PIX_GATEWAY_TOKEN;
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;
delete process.env.LINHABANK_SQL;

type Chamada = { url: string; method: string; headers: Record<string, string>; body: string };

const chamadas: Chamada[] = [];
let recusarEnvio = false;
let chaveInvalida = false;
let listarChaves = true;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  const bruto = init?.headers;
  if (bruto !== undefined && !(bruto instanceof Headers) && !Array.isArray(bruto)) {
    for (const [chave, valor] of Object.entries(bruto)) headers[chave.toLowerCase()] = String(valor);
  }
  const chamada: Chamada = {
    url,
    method: (init?.method ?? "GET").toUpperCase(),
    headers,
    body: typeof init?.body === "string" ? init.body : "",
  };
  chamadas.push(chamada);
  if (!url.startsWith("https://api.asaas.com/")) {
    throw new Error(`rede bloqueada no teste: ${new URL(url).host}`);
  }
  if (url.includes("/v3/pix/addressKeys")) {
    const corpo = listarChaves
      ? { data: [{ key: "b6295ee1-f054-47d1-9e90-ee57b74f60d9", status: "ACTIVE", type: "EVP" }] }
      : { data: [] };
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.endsWith("/v3/pix/qrCodes/static")) {
    return new Response(
      JSON.stringify({
        id: "9bea9bcd226b45c7980065f598be54d5",
        payload: "00020126580014br.gov.bcb.pix0136b6295ee1-f054-47d1-9e90-ee57b74f60d95204000053039865406100.005802BR5910LINHABANK6009SAO PAULO6304ABCD",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  if (url.endsWith("/v3/transfers")) {
    if (chaveInvalida) {
      return new Response(
        JSON.stringify({ errors: [{ code: "invalid_pix_key", description: "Chave PIX inválida" }] }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    if (recusarEnvio) {
      return new Response(JSON.stringify({ id: "tr_falha", status: "FAILED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        id: "777eb7c8-b1a2-4356-8fd8-a1b0644b5282",
        status: "PENDING",
        endToEndIdentifier: "E2EASAAS0001",
        authorized: true,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  throw new Error(`endpoint asaas nao mockado: ${url}`);
};

const { aceitarTermos, creditarPixRecebido, estornarPixExterno, operarConta } = await import("../bot/lib/banco.js");
const { avisoDePagamentoAsaas, lerEventoAsaas, referenciaTransferenciaAsaas, tipoChaveAsaas } = await import(
  "../bot/lib/asaas.js"
);
const { pspAtual, rotuloLiquidacao } = await import("../bot/lib/psp.js");

function assert(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

function precisa<T>(valor: T | undefined, mensagem: string): T {
  if (valor === undefined) throw new Error(mensagem);
  return valor;
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

async function abrir(kv: HostKvApi, chatId: string, centavos: number): Promise<{ referencia: string }> {
  const conta = await aceitarTermos(kv, chatId, "Ana Silva");
  if (centavos > 0) {
    const credito = await creditarPixRecebido(kv, {
      id: `credito-${chatId}`,
      referencia: conta.referencia,
      valorCentavos: centavos,
      endToEndId: "E2ECREDITO1",
    });
    assert(credito.estado === "novo", "credito inicial nao entrou");
  }
  return { referencia: conta.referencia };
}

async function saldoDe(kv: HostKvApi, chatId: string): Promise<number> {
  const conta = await operarConta(kv, chatId, `saldo:${chatId}:${Math.random()}`, { acao: "resumo" });
  const [reais, cents] = (conta.saldo ?? "0,00").split(",");
  return Number(reais) * 100 + Number(cents);
}

assert(tipoChaveAsaas("ana@email.com") === "EMAIL", "email");
assert(tipoChaveAsaas("+5511987654321") === "PHONE", "telefone");
assert(tipoChaveAsaas("52998224725") === "CPF", "cpf");
assert(tipoChaveAsaas("13217949000125") === "CNPJ", "cnpj");
assert(tipoChaveAsaas("b6295ee1-f054-47d1-9e90-ee57b74f60d9") === "EVP", "evp");
assert(tipoChaveAsaas("lb12345678@linhabank") === undefined, "chave interna nao e asaas");
assert(pspAtual().nome === "asaas", `psp era ${pspAtual().nome}`);
assert(rotuloLiquidacao() === "Asaas (produção)", `rotulo ${rotuloLiquidacao()}`);

{
  const kv = kvMemoria();
  await abrir(kv, "a", 20_000);
  const enviado = await operarConta(kv, "a", "pix-asaas", {
    acao: "enviar_pix",
    valor: "50,00",
    chavePix: "ana@email.com",
  });
  const transferencia = precisa(
    chamadas.find((item) => item.url.endsWith("/v3/transfers")),
    "nao chamou /v3/transfers",
  );
  assert(enviado.ok && enviado.interno === false && enviado.endToEndId === "E2EASAAS0001", "envio asaas falhou");
  assert(transferencia.headers.access_token === process.env.ASAAS_API_KEY, "sem access_token");
  assert(transferencia.headers["user-agent"] === "LinhaBank/1.0", "sem user-agent");
  const corpo = JSON.parse(transferencia.body) as {
    value?: number;
    pixAddressKey?: string;
    pixAddressKeyType?: string;
  };
  assert(corpo.value === 50 && corpo.pixAddressKey === "ana@email.com" && corpo.pixAddressKeyType === "EMAIL", "corpo do envio");
  assert((await saldoDe(kv, "a")) === 15_000, "debito asaas divergiu");
}

{
  const kv = kvMemoria();
  await abrir(kv, "b", 20_000);
  chaveInvalida = true;
  const recusado = await operarConta(kv, "b", "pix-chave-ruim", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
  });
  chaveInvalida = false;
  assert(recusado.ok === false && recusado.motivo === "destino_invalido", "chave invalida nao mapeou");
  assert((await saldoDe(kv, "b")) === 20_000, "falha asaas nao estornou");
}

{
  const kv = kvMemoria();
  await abrir(kv, "c", 20_000);
  recusarEnvio = true;
  const recusado = await operarConta(kv, "c", "pix-falha", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "+5511987654321",
  });
  recusarEnvio = false;
  const transferencia = [...chamadas].reverse().find((item) => item.url.endsWith("/v3/transfers"));
  const corpo = JSON.parse(transferencia?.body ?? "{}") as { pixAddressKey?: string; pixAddressKeyType?: string };
  assert(corpo.pixAddressKey === "11987654321" && corpo.pixAddressKeyType === "PHONE", "telefone asaas");
  assert(recusado.ok === false && (await saldoDe(kv, "c")) === 20_000, "FAILED nao estornou");
}

{
  const kv = kvMemoria();
  await abrir(kv, "d", 0);
  const deposito = await operarConta(kv, "d", "dep-asaas", { acao: "depositar", valor: "100,00" });
  const qr = precisa(
    chamadas.find((item) => item.url.endsWith("/v3/pix/qrCodes/static")),
    "nao chamou qr static",
  );
  assert(deposito.ok && deposito.copiaECola?.startsWith("000201") === true, "qr asaas falhou");
  const corpo = JSON.parse(qr.body) as {
    addressKey?: string;
    value?: number;
    allowsMultiplePayments?: boolean;
    externalReference?: string;
  };
  assert(corpo.addressKey === "b6295ee1-f054-47d1-9e90-ee57b74f60d9", "addressKey");
  assert(corpo.value === 100 && corpo.allowsMultiplePayments === false, "valor do qr");
  assert(corpo.externalReference === deposito.destino, "externalReference");
  assert((await saldoDe(kv, "d")) === 0, "deposito creditou cedo");

  const evento = lerEventoAsaas({
    id: "evt_asaas_recebido_0001",
    event: "PAYMENT_RECEIVED",
    payment: {
      id: "pay_080225913252",
      value: 100,
      billingType: "PIX",
      pixQrCodeId: "9bea9bcd226b45c7980065f598be54d5",
      externalReference: deposito.destino,
      pixTransaction: { endToEndIdentifier: "E2ERECEBIDO1" },
    },
  });
  assert(evento !== undefined, "evento asaas");
  const aviso = avisoDePagamentoAsaas(evento!);
  assert(aviso?.valorCentavos === 10_000 && aviso.cobrancaId === deposito.destino, "aviso asaas");
  const credito = await creditarPixRecebido(kv, aviso!);
  assert(credito.estado === "novo" && (await saldoDe(kv, "d")) === 10_000, "credito asaas falhou");
  const repetido = await creditarPixRecebido(kv, aviso!);
  assert(repetido.estado === "repetido", "idempotencia asaas");
}

{
  delete process.env.PIX_RECEBIMENTO_CHAVE;
  listarChaves = true;
  const kv = kvMemoria();
  await abrir(kv, "e", 0);
  const deposito = await operarConta(kv, "e", "dep-lista", { acao: "depositar", valor: "25,00" });
  assert(deposito.ok === true, "qr com chave listada falhou");
  assert(
    chamadas.some((item) => item.url.includes("/v3/pix/addressKeys")),
    "nao listou chaves pix",
  );
  process.env.PIX_RECEBIMENTO_CHAVE = "b6295ee1-f054-47d1-9e90-ee57b74f60d9";
}

{
  const kv = kvMemoria();
  await abrir(kv, "f", 20_000);
  const enviado = await operarConta(kv, "f", "pix-depois-falha", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
  });
  assert(enviado.ok === true && (await saldoDe(kv, "f")) === 19_000, "envio para estorno falhou");
  const transferencia = precisa(
    [...chamadas].reverse().find((item) => item.url.endsWith("/v3/transfers")),
    "envio para estorno sem transfer",
  );
  const referencia = precisa(
    (JSON.parse(transferencia.body) as { externalReference?: string }).externalReference,
    "envio sem externalReference",
  );
  assert(referencia.length >= 4, "envio sem externalReference");
  const evento = lerEventoAsaas({
    id: "evt_transfer_fail",
    event: "TRANSFER_FAILED",
    transfer: { id: "tr_1", status: "FAILED", externalReference: referencia },
  });
  assert(referenciaTransferenciaAsaas(evento!) === referencia, "referencia transferencia");
  const estorno = await estornarPixExterno(kv, referencia);
  assert(estorno.estado === "novo" && (await saldoDe(kv, "f")) === 20_000, "webhook de falha nao estornou");
  const repetido = await estornarPixExterno(kv, referencia);
  assert(repetido.estado === "repetido", "estorno asaas repetiu");
}

{
  process.env.LINHABANK_MODO = "sandbox";
  const kv = kvMemoria();
  await abrir(kv, "g", 0);
  const antes = chamadas.length;
  const deposito = await operarConta(kv, "g", "dep-sandbox-asaas", { acao: "depositar", valor: "12,00" });
  assert(deposito.ok === true && deposito.copiaECola?.startsWith("000201") === true, "deposito homologacao asaas");
  assert(
    chamadas.slice(antes).some((item) => item.url.endsWith("/v3/pix/qrCodes/static")),
    "homologacao nao gerou QR Asaas",
  );
  process.env.LINHABANK_MODO = "live";
}

assert(avisoDePagamentoAsaas({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_x1234567", value: 10 } }) === undefined, "confirmado creditou");
assert(lerEventoAsaas({ event: "PING", extra: true }) !== undefined, "evento desconhecido");

console.log("asaas ok");
