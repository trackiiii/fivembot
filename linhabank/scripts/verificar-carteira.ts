import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.PIX_GATEWAY_URL = "https://pix.example.test";
process.env.PIX_GATEWAY_TOKEN = "token-de-teste";
process.env.PIX_RECEBIMENTO_CHAVE = "sandbox@linhabank.test";
process.env.LINHABANK_MODO = "sandbox";
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;
delete process.env.LINHABANK_SQL;
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;
delete process.env.PIX_TAXA_GATEWAY_CENTAVOS;
delete process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS;
delete process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_PERCENTUAL;

let envios = 0;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://pix.example.test/")) {
    envios += 1;
    const corpo = { ok: true, endToEndId: "E2EEXTERNO1" };
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`rede bloqueada no teste: ${new URL(url).host}`);
};

const {
  aceitarTermos,
  bloquearConta,
  confirmarCobrancaSandbox,
  creditarPixRecebido,
  decidirTermos,
  operarConta,
  TERMOS_VERSAO,
  TEXTO_TERMOS,
} = await import("../bot/lib/banco.js");
const { montarCopiaECola } = await import("../bot/lib/brcode.js");
const { comVozThialinha, interpretarAtualizacao } = await import("../bot/lib/atendimento.js");
const { sqlDisponivel } = await import("../bot/lib/db.js");
const { movimentosDoDia, respostaStartComConta } = await import("../bot/lib/respostas.js");

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

async function abrir(kv: HostKvApi, chatId: string): Promise<{ numero: string; chave: string; referencia: string }> {
  const conta = await aceitarTermos(kv, chatId, "Ana Silva");
  return { numero: conta.numero, chave: conta.chaveInterna, referencia: conta.referencia };
}

async function saldoDe(kv: HostKvApi, chatId: string): Promise<number> {
  const conta = await operarConta(kv, chatId, `saldo:${chatId}:${Math.random()}`, { acao: "resumo" });
  const [reais, cents] = (conta.saldo ?? "0,00").split(",");
  return Number(reais) * 100 + Number(cents);
}

{
  assert(TEXTO_TERMOS.includes("TERMOS DE USO E ABERTURA DE CONTA — LUNEX"), "termos sem título Lunex");
  assert(TEXTO_TERMOS.includes("Taxa fixa: R$ 2,00."), "termos sem taxa fixa");
  assert(TEXTO_TERMOS.includes("Taxa variável: 15%"), "termos sem taxa variável");
  assert(TEXTO_TERMOS.includes("Lei nº 13.709/2018"), "termos sem LGPD");
  assert(TERMOS_VERSAO === "2026-11-21", `versão dos termos: ${TERMOS_VERSAO}`);
  assert(decidirTermos("ACEITAR E CONTINUAR") === "concordo", "aceite do botão não abre a conta");
  assert(decidirTermos("CONCORDO") === "concordo", "CONCORDO deixou de abrir a conta");
}

{
  const payload = montarCopiaECola({
    chave: "sandbox@linhabank.test",
    valorCentavos: 1234,
    txid: "LBTESTETXID0001",
    nome: "LINHABANK",
    cidade: "SAO PAULO",
  });
  assert(payload.startsWith("000201"), "BR Code sem payload EMV");
  assert(payload.endsWith(payload.slice(-4)), "CRC ausente");
  assert(payload.includes("BR.GOV.BCB.PIX") || payload.includes("br.gov.bcb.pix"), "BR Code sem GUI PIX");
}

{
  const foto = interpretarAtualizacao({
    update_id: 9,
    message: {
      message_id: 1,
      chat: { id: 11, type: "private" },
      from: { first_name: "Ana", is_bot: false },
      photo: [{ file_id: "abc" }],
    },
  });
  assert(foto.tipo === "comprovante", "foto de comprovante foi tratada como texto");
}

{
  assert(comVozThialinha("Oii! Seu saldo é R$ 10,00.") === "<b>Thialinha</b>: Oii! Seu saldo é R$ 10,00.", "falta o nome da Thialinha");
  assert(comVozThialinha("Thialinha: Opa") === "<b>Thialinha</b>: Opa", "duplicou o prefixo");
  assert(comVozThialinha("thialinha: já estou aqui") === "<b>Thialinha</b>: já estou aqui", "não normalizou o prefixo");
  assert(
    comVozThialinha("Eu sou a Thialinha, do LinhaBank.") === "<b>Thialinha</b>: Eu sou a <b>Thialinha</b>, do LinhaBank.",
    "nome no texto sem negrito",
  );
  assert(comVozThialinha("saldo < 10 & ok") === "<b>Thialinha</b>: saldo &lt; 10 &amp; ok", "html do cliente não foi escapado");
  const prefixoAnterior = process.env.LINHABANK_PREFIXO_THIALINHA;
  process.env.LINHABANK_PREFIXO_THIALINHA = "0";
  assert(comVozThialinha("Eu sou a Thialinha.") === "Eu sou a <b>Thialinha</b>.", "nome sem prefixo ficou sem negrito");
  if (prefixoAnterior === undefined) delete process.env.LINHABANK_PREFIXO_THIALINHA;
  else process.env.LINHABANK_PREFIXO_THIALINHA = prefixoAnterior;
}

{
  const kv = kvMemoria();
  const origem = await abrir(kv, "1");
  const destino = await abrir(kv, "2");
  await creditarPixRecebido(kv, {
    id: "credito-origem-01",
    referencia: origem.referencia,
    valorCentavos: 10_000,
    endToEndId: "E2ECRED1",
  });
  const enviado = await operarConta(kv, "1", "pix-ledger", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: destino.chave,
  });
  assert(enviado.ok && enviado.comprovante !== undefined, "transferência interna sem comprovante");
  assert((await saldoDe(kv, "1")) === 9_000 && (await saldoDe(kv, "2")) === 1_000, "ledger interno divergiu");
  const extrato = await operarConta(kv, "1", "ext-1", { acao: "extrato" });
  assert(extrato.extrato?.some((item) => item.tipo === "pix_enviado") === true, "extrato sem o débito");
}

{
  const kv = kvMemoria();
  const conta = await abrir(kv, "3");
  const deposito = await operarConta(kv, "3", "dep-1", { acao: "depositar", valor: "25,00" });
  assert(deposito.ok && deposito.copiaECola !== undefined && deposito.txid !== undefined, "depósito não gerou copia e cola");
  assert((await saldoDe(kv, "3")) === 0, "gerar QR creditou saldo");
  const divergente = await creditarPixRecebido(kv, {
    id: "wh-dep-0",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 1_000,
  });
  assert(divergente.estado === "valor_divergente" && (await saldoDe(kv, "3")) === 0, "valor divergente alterou o saldo");
  const pago = await creditarPixRecebido(kv, {
    id: "wh-dep-1",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 2_500,
  });
  assert(pago.estado === "novo" && (await saldoDe(kv, "3")) === 2_500, "webhook do depósito não creditou");
  const outra = await creditarPixRecebido(kv, {
    id: "wh-dep-1",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 2_500,
  });
  assert(outra.estado === "repetido" && (await saldoDe(kv, "3")) === 2_500, "webhook duplicado creditou de novo");
  void conta;
}

{
  const kv = kvMemoria();
  const origem = await abrir(kv, "4");
  await creditarPixRecebido(kv, {
    id: "credito-bloqueio",
    referencia: origem.referencia,
    valorCentavos: 5_000,
  });
  await bloquearConta(kv, "4", true);
  const enviado = await operarConta(kv, "4", "pix-bloqueado", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
  });
  assert(enviado.ok === false && enviado.motivo === "conta_bloqueada", "conta bloqueada enviou PIX");
  assert((await saldoDe(kv, "4")) === 5_000, "bloqueio alterou saldo");
}

{
  const kv = kvMemoria();
  const conta = await abrir(kv, "5");
  const deposito = await operarConta(kv, "5", "dep-sandbox", { acao: "depositar", valor: "8,00" });
  assert(deposito.destino !== undefined, "sandbox sem cobrança");
  const pago = await confirmarCobrancaSandbox(kv, deposito.destino ?? "");
  assert(pago.estado === "novo" && (await saldoDe(kv, "5")) === 800, "sandbox não creditou pelo endpoint interno");
}

{
  const kv = kvMemoria();
  const conta = await abrir(kv, "start-1");
  const vazio = await operarConta(kv, "start-1", "start-vazio", { acao: "extrato" });
  const textoVazio = respostaStartComConta({
    nome: "Ana Silva",
    saldo: vazio.saldo ?? "",
    movimentos: movimentosDoDia(vazio.extrato ?? []),
  });
  assert(textoVazio.includes("0,00"), "start sem saldo do backend");
  assert(/não teve movimentação/i.test(textoVazio), "start sem movimento do dia não avisou");
  await creditarPixRecebido(kv, {
    id: "cred-start-1",
    referencia: conta.referencia,
    valorCentavos: 2550,
    endToEndId: "E2ESTART1",
  });
  const lista = await operarConta(kv, "start-1", "start-dia", { acao: "extrato" });
  const ontem = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const filtrado = movimentosDoDia([
    ...(lista.extrato ?? []),
    { em: ontem, tipo: "pix_enviado", valor: "9,00", descricao: "ontem" },
  ]);
  assert(filtrado.some((item) => item.valor === "25,50"), "start não pegou o movimento de hoje");
  assert(!filtrado.some((item) => item.valor === "9,00"), "start misturou movimento de outro dia");
  const texto = respostaStartComConta({
    nome: "Ana Silva",
    saldo: lista.saldo ?? "",
    movimentos: filtrado,
  });
  assert(texto.includes("25,50"), "start não falou o valor de hoje");
  assert(texto.includes("Ana"), "start sem nome");
  assert(!texto.includes("9,00"), "start citou movimento antigo");
}

{
  const kv = kvMemoria();
  process.env.PIX_TAXA_CENTAVOS = "50";
  process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS = "99";
  const conta = await abrir(kv, "taxa-in");
  const credito = await creditarPixRecebido(kv, {
    id: "cred-taxa-in",
    referencia: conta.referencia,
    valorCentavos: 1_000,
    endToEndId: "E2ETAXAIN",
  });
  assert(credito.estado === "novo", "recebimento com taxa não creditou");
  assert((await saldoDe(kv, "taxa-in")) === 851, `saldo líquido ${await saldoDe(kv, "taxa-in")}`);
  const deposito = await operarConta(kv, "taxa-in", "dep-taxa", { acao: "depositar", valor: "10,00" });
  assert(deposito.ok && deposito.txid !== undefined, "depósito com tarifa não gerou cobrança");
  assert(deposito.valor === "11,49" && deposito.taxa === "1,49" && deposito.liquido === "10,00", `QR sem a tarifa: ${deposito.valor} / ${deposito.taxa}`);
  const divergenteTaxa = await creditarPixRecebido(kv, {
    id: "wh-dep-taxa-div",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 1_000,
  });
  assert(divergenteTaxa.estado === "valor_divergente", "aceitou pagamento sem a tarifa");
  const pago = await creditarPixRecebido(kv, {
    id: "wh-dep-taxa",
    cobrancaId: deposito.destino,
    txid: deposito.txid,
    valorCentavos: 1_149,
  });
  assert(pago.estado === "novo" && (await saldoDe(kv, "taxa-in")) === 1_851, `depósito liquidado não creditou o líquido: ${await saldoDe(kv, "taxa-in")}`);
  const destino = await abrir(kv, "taxa-int");
  const interno = await operarConta(kv, "taxa-in", "pix-int-taxa", {
    acao: "enviar_pix",
    valor: "8,51",
    chavePix: destino.chave,
  });
  assert(interno.ok && interno.interno === true && interno.taxa === "0,00", "PIX interno cobrou tarifa de recebimento");
  assert((await saldoDe(kv, "taxa-int")) === 851, "destino interno não recebeu o valor integral");
  delete process.env.PIX_TAXA_CENTAVOS;
  delete process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS;
}

assert(sqlDisponivel() === false, "SQL ligou sem configuração");

process.env.LINHABANK_SQL = "memoria";
{
  const { aceitarTermos: aceitarSql, operarConta: operarSql, creditarPixRecebido: creditarSql } = await import(
    "../bot/lib/banco.js"
  );
  const kv = kvMemoria();
  const origem = await aceitarSql(kv, "sql-a", "Ana");
  const destino = await aceitarSql(kv, "sql-b", "Bia");
  await creditarSql(kv, { id: "sql-cred", referencia: origem.referencia, valorCentavos: 4_000 });
  const enviado = await operarSql(kv, "sql-a", "sql-pix", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: destino.chaveInterna,
  });
  assert(enviado.ok === true, "PIX interno no SQL falhou");
  const saldoOrigem = await operarSql(kv, "sql-a", "sql-sa", { acao: "resumo" });
  const saldoDestino = await operarSql(kv, "sql-b", "sql-sb", { acao: "resumo" });
  assert(saldoOrigem.saldo === "30,00" && saldoDestino.saldo === "10,00", "saldos SQL divergiram");
}

{
  const { aceitarTermos: aceitarSql, operarConta: operarSql, creditarPixRecebido: creditarSql } = await import(
    "../bot/lib/banco.js"
  );
  process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS = "99";
  process.env.PIX_TAXA_CENTAVOS = "1";
  const kv = kvMemoria();
  const conta = await aceitarSql(kv, "sql-taxa", "Ana");
  const credito = await creditarSql(kv, { id: "sql-cred-taxa", referencia: conta.referencia, valorCentavos: 200 });
  assert(credito.estado === "novo", "SQL não creditou recebimento com tarifa");
  const saldo = await operarSql(kv, "sql-taxa", "sql-taxa-s", { acao: "resumo" });
  assert(saldo.saldo === "1,00", `SQL não aplicou crédito e tarifa na sequência: ${saldo.saldo}`);
  delete process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS;
  delete process.env.PIX_TAXA_CENTAVOS;
}

console.log("carteira ok");
