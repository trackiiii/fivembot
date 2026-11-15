import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.PIX_GATEWAY_URL = "https://pix.example.test";
process.env.PIX_GATEWAY_TOKEN = "token-de-teste";

const originalFetch = globalThis.fetch;
let envios = 0;
globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://pix.example.test/")) {
    envios += 1;
    return new Response(JSON.stringify({ ok: true, endToEndId: "E2EAGENDADO1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`rede bloqueada no teste: ${new URL(url).host}`);
};

const { aceitarTermos, creditarPixRecebido, operarConta } = await import("../bot/lib/banco.js");
const {
  cancelarAgendamento,
  criarAgendamento,
  listarAgendamentos,
  processarAgendamentos,
} = await import("../bot/lib/agenda.js");
const { instanteNoBrasil, ocorrenciaDevida, proximaDepois } = await import("../bot/lib/horario.js");

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

function avisarDe(caixa: string[]): (chatId: string, texto: string) => Promise<boolean> {
  return async (_chatId, texto) => {
    assert(!/gateway|webhook|token/i.test(texto), `aviso vazou ligacao interna: ${texto}`);
    caixa.push(texto);
    return true;
  };
}

async function saldoDe(kv: HostKvApi, chatId: string): Promise<number> {
  const conta = await operarConta(kv, chatId, `saldo:${chatId}:${Math.random()}`, { acao: "resumo" });
  assert(conta.ok && conta.saldo !== undefined, "saldo indisponivel");
  const [reais, cents] = (conta.saldo ?? "0,00").split(",");
  return Number(reais) * 100 + Number(cents);
}

async function abrir(kv: HostKvApi, chatId: string, centavos: number): Promise<void> {
  const conta = await aceitarTermos(kv, chatId, "Ana");
  if (centavos <= 0) return;
  const credito = await creditarPixRecebido(kv, {
    id: `credito-${chatId}`,
    referencia: conta.referencia,
    valorCentavos: centavos,
    endToEndId: "E2ECREDITO1",
  });
  assert(credito.estado === "novo", "credito nao entrou");
}

const manha = instanteNoBrasil(2026, 11, 15, 10, 0);
const meioDia = instanteNoBrasil(2026, 11, 20, 12, 0);

function instanteIso(ano: number, mes: number, dia: number, hora: number, minuto: number): string {
  return instanteNoBrasil(ano, mes, dia, hora, minuto).toISOString();
}

assert(instanteIso(2026, 11, 20, 9, 0) === "2026-11-20T12:00:00.000Z", "09:00 de Brasilia nao virou 12:00 UTC");
assert(
  ocorrenciaDevida("diaria", instanteIso(2026, 11, 12, 9, 0), instanteNoBrasil(2026, 11, 15, 10, 0)) ===
    instanteIso(2026, 11, 15, 9, 0),
  "a ocorrencia devida ficou no meio dos dias perdidos",
);
assert(
  proximaDepois("diaria", instanteIso(2026, 11, 15, 9, 0), instanteNoBrasil(2026, 11, 15, 10, 0)) ===
    instanteIso(2026, 11, 16, 9, 0),
  "o proximo dia nao avancou um dia",
);

{
  const kv = kvMemoria();
  await abrir(kv, "1", 0);
  const interna = await criarAgendamento(
    kv,
    "1",
    { valor: "10,00", chavePix: "lb12345678@linhabank", frequencia: "uma_vez", data: "20/11/2026", hora: "09:00" },
    manha,
  );
  assert(interna.ok === false && interna.motivo === "destino_invalido", "chave interna inexistente foi aceita");
  const passado = await criarAgendamento(
    kv,
    "1",
    { valor: "10,00", chavePix: "ana@email.com", frequencia: "uma_vez", data: "2026-11-15", hora: "09:00" },
    manha,
  );
  assert(passado.motivo === "horario_passado", "horario passado foi aceito");
  const dia31 = await criarAgendamento(
    kv,
    "1",
    { valor: "10,00", chavePix: "ana@email.com", frequencia: "mensal", data: "2026-11-30", hora: "09:00" },
    manha,
  );
  assert(dia31.motivo === "dia_invalido", "dia 30 mensal foi aceito");
  const semanal = await criarAgendamento(
    kv,
    "1",
    { valor: "10,00", chavePix: "ana@email.com", frequencia: "semanal", data: "2026-11-18", hora: "09:00" },
    manha,
  );
  assert(semanal.ok && semanal.agendamentos[0]?.repeticao === "toda quarta", `repeticao semanal: ${semanal.texto}`);
  assert(semanal.texto.includes("automático") && semanal.texto.includes("AG-"), "texto de criacao incompleto");
  assert(!/gateway|webhook/i.test(semanal.texto), "criacao vazou ligacao interna");
}

{
  const kv = kvMemoria();
  const avisos: string[] = [];
  await abrir(kv, "2", 20_000);
  const criado = await criarAgendamento(
    kv,
    "2",
    { valor: "15,50", chavePix: "ana@email.com", frequencia: "uma_vez", data: "20/11/2026", hora: "11:00" },
    manha,
  );
  assert(criado.ok, criado.texto);
  const antes = await processarAgendamentos(kv, manha, avisarDe(avisos));
  assert(antes.enviados === 0 && (await saldoDe(kv, "2")) === 20_000, "PIX saiu antes da hora");
  const cancelado = await cancelarAgendamento(kv, "2", criado.agendamentos[0]?.id.toLowerCase());
  assert(cancelado.ok, cancelado.texto);
  assert(cancelado.texto.includes("não será mais enviado"), "cancelamento sem a frase padrao");
  const depois = await processarAgendamentos(kv, meioDia, avisarDe(avisos));
  assert(depois.enviados === 0 && (await saldoDe(kv, "2")) === 20_000, "PIX cancelado foi enviado");
  assert((await listarAgendamentos(kv, "2")).agendamentos.length === 0, "cancelado continuou ativo");
}

{
  const kv = kvMemoria();
  const avisos: string[] = [];
  await abrir(kv, "3", 0);
  await criarAgendamento(
    kv,
    "3",
    { valor: "10,00", chavePix: "ana@email.com", frequencia: "uma_vez", data: "2026-11-20", hora: "09:00" },
    manha,
  );
  const rodada = await processarAgendamentos(kv, meioDia, avisarDe(avisos));
  assert(rodada.encerrados === 1 && (await saldoDe(kv, "3")) === 0, "sem saldo o agendamento seguiu ou debitou");
  assert(avisos.some((texto) => texto.includes("foi encerrado")), "nao avisou o encerramento");
  assert((await listarAgendamentos(kv, "3")).agendamentos.length === 0, "agendamento sem saldo continuou ativo");
}

{
  const kv = kvMemoria();
  const avisos: string[] = [];
  await abrir(kv, "4", 50_000);
  await abrir(kv, "5", 50_000);
  const antesEnvios = envios;
  await criarAgendamento(
    kv,
    "4",
    { valor: "10,00", chavePix: "ana@email.com", frequencia: "uma_vez", data: "2026-11-20", hora: "09:00" },
    manha,
  );
  const junto = await Promise.all([
    processarAgendamentos(kv, meioDia, avisarDe(avisos)),
    processarAgendamentos(kv, meioDia, avisarDe(avisos)),
  ]);
  assert(junto[0] === junto[1], "dois ciclos paralelos nao foram o mesmo");
  assert(envios === antesEnvios + 1, `envios ${envios - antesEnvios}, esperado 1`);
  assert((await saldoDe(kv, "4")) === 49_000, "debito unico falhou");
  assert((await saldoDe(kv, "5")) === 50_000, "outra conta foi debitada");
  const extrato = await operarConta(kv, "4", "extrato-4", { acao: "extrato" });
  assert(
    extrato.extrato?.some((item) => item.descricao.startsWith("PIX agendado para ana@email.com")) === true,
    "extrato nao marcou o PIX agendado",
  );
  const repetido = await processarAgendamentos(kv, meioDia, avisarDe(avisos));
  assert(repetido.enviados === 0 && envios === antesEnvios + 1 && (await saldoDe(kv, "4")) === 49_000, "reprocessar debitou de novo");
  assert(avisos.some((texto) => texto.includes("Comprovante E2EAGENDADO1")), "aviso sem comprovante");
}

{
  const kv = kvMemoria();
  const avisos: string[] = [];
  await abrir(kv, "6", 50_000);
  const antesEnvios = envios;
  await criarAgendamento(
    kv,
    "6",
    { valor: "10,00", chavePix: "boleto@email.com", frequencia: "diaria", data: "2026-11-15", hora: "09:00" },
    manha,
  );
  const atraso = await processarAgendamentos(kv, instanteNoBrasil(2026, 11, 18, 10, 0), avisarDe(avisos));
  assert(atraso.enviados === 1 && envios === antesEnvios + 1, "dias perdidos geraram mais de um PIX");
  assert((await saldoDe(kv, "6")) === 49_000, "catch-up debitou valor errado");
  const lista = await listarAgendamentos(kv, "6");
  assert(lista.agendamentos.length === 1, "recorrente nao continuou ativo");
  assert(lista.agendamentos[0]?.quando === "19/11/2026 às 09:00", `proximo ficou ${lista.agendamentos[0]?.quando}`);
  assert(lista.texto.includes("todo dia"), "lista sem a frequencia");
}

{
  const kv = kvMemoria();
  const avisos: string[] = [];
  await abrir(kv, "7", 50_000);
  const url = process.env.PIX_GATEWAY_URL;
  const token = process.env.PIX_GATEWAY_TOKEN;
  const asaas = process.env.ASAAS_API_KEY;
  delete process.env.PIX_GATEWAY_URL;
  delete process.env.PIX_GATEWAY_TOKEN;
  delete process.env.ASAAS_API_KEY;
  const antesEnvios = envios;
  await criarAgendamento(
    kv,
    "7",
    { valor: "10,00", chavePix: "ana@email.com", frequencia: "uma_vez", data: "2026-11-20", hora: "09:00" },
    manha,
  );
  const primeira = await processarAgendamentos(kv, meioDia, avisarDe(avisos));
  const segunda = await processarAgendamentos(kv, new Date(meioDia.getTime() + 60_000), avisarDe(avisos));
  assert(primeira.enviados === 0 && segunda.enviados === 0, "PIX sem ligacao foi enviado");
  assert(envios === antesEnvios && (await saldoDe(kv, "7")) === 50_000, "saldo mudou sem envio");
  assert((await listarAgendamentos(kv, "7")).agendamentos.length === 1, "agendamento foi encerrado sem envio");
  assert(avisos.filter((texto) => texto.includes("continua agendado")).length === 1, "avisou a espera mais de uma vez");
  process.env.PIX_GATEWAY_URL = url;
  process.env.PIX_GATEWAY_TOKEN = token;
  if (asaas !== undefined) process.env.ASAAS_API_KEY = asaas;
  const retomada = await processarAgendamentos(kv, new Date(meioDia.getTime() + 6 * 60_000), avisarDe(avisos));
  assert(retomada.enviados === 1 && (await saldoDe(kv, "7")) === 49_000, "nao retomou o envio depois da espera");
}

{
  const kv = kvMemoria();
  await abrir(kv, "8", 0);
  const pedidos = [0, 1].map((indice) =>
    criarAgendamento(
      kv,
      "8",
      {
        valor: "5,00",
        chavePix: `pessoa${indice}@email.com`,
        frequencia: "uma_vez",
        data: "2026-12-01",
        hora: "09:00",
      },
      manha,
    ),
  );
  const criados = await Promise.all(pedidos);
  assert(criados.every((item) => item.ok), "criacao paralela perdeu um agendamento");
  assert((await listarAgendamentos(kv, "8")).agendamentos.length === 2, "lista paralela incompleta");
  for (let dia = 2; dia <= 4; dia += 1) {
    const extra = await criarAgendamento(
      kv,
      "8",
      { valor: "5,00", chavePix: "ana@email.com", frequencia: "uma_vez", data: `2026-12-0${dia}`, hora: "09:00" },
      manha,
    );
    assert(extra.ok, extra.texto);
  }
  const cheio = await criarAgendamento(
    kv,
    "8",
    { valor: "5,00", chavePix: "ana@email.com", frequencia: "uma_vez", data: "2026-12-06", hora: "09:00" },
    manha,
  );
  assert(cheio.motivo === "limite", "passou do maximo de agendamentos");
}

{
  const kv = kvMemoria();
  await abrir(kv, "9", 50_000);
  const primeiro = await operarConta(kv, "9", "sessao-fixa", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
    origem: "agendado",
  });
  const segundo = await operarConta(kv, "9", "sessao-fixa", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
    origem: "agendado",
  });
  assert(primeiro.ok && segundo.ok && primeiro.endToEndId === segundo.endToEndId, "repeticao da mesma operacao divergiu");
  assert((await saldoDe(kv, "9")) === 49_000, "a mesma operacao debitou duas vezes");
}

globalThis.fetch = originalFetch;
console.log("agenda ok");
