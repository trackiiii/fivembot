import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.PIX_GATEWAY_URL = "https://pix.example.test";
process.env.PIX_GATEWAY_TOKEN = "token-de-teste";
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;

let envios = 0;
let ultimoCorpo = "";
let recusar = false;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://pix.example.test/")) {
    envios += 1;
    ultimoCorpo = typeof init?.body === "string" ? init.body : "";
    const corpo = recusar
      ? { ok: false, motivo: "recusado" }
      : { ok: true, endToEndId: "E2EEXTERNO1" };
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`rede bloqueada no teste: ${new URL(url).host}`);
};

const { aceitarTermos, creditarPixRecebido, operarConta } = await import("../bot/lib/banco.js");
const { taxaPixExternoCentavos } = await import("../bot/lib/taxa.js");
const { criarAgendamento, processarAgendamentos } = await import("../bot/lib/agenda.js");
const { instanteNoBrasil } = await import("../bot/lib/horario.js");

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

async function abrir(kv: HostKvApi, chatId: string, centavos: number): Promise<{ numero: string; chave: string }> {
  const conta = await aceitarTermos(kv, chatId, "Ana Silva");
  if (centavos > 0) {
    const credito = await creditarPixRecebido(kv, {
      id: `credito-${chatId}`,
      referencia: conta.referencia,
      valorCentavos: centavos,
      endToEndId: "E2ECREDITO1",
    });
    assert(credito.estado === "novo", "credito nao entrou");
  }
  return { numero: conta.numero, chave: conta.chaveInterna };
}

async function saldoDe(kv: HostKvApi, chatId: string): Promise<number> {
  const conta = await operarConta(kv, chatId, `saldo:${chatId}:${Math.random()}`, { acao: "resumo" });
  const [reais, cents] = (conta.saldo ?? "0,00").split(",");
  return Number(reais) * 100 + Number(cents);
}

assert(taxaPixExternoCentavos(10_000) === 0, "taxa padrao nao e zero");
process.env.PIX_TAXA_CENTAVOS = "150";
process.env.PIX_TAXA_PERCENTUAL = "1,50";
assert(taxaPixExternoCentavos(10_000) === 300, `taxa configurada deu ${taxaPixExternoCentavos(10_000)}`);
process.env.PIX_TAXA_GATEWAY_CENTAVOS = "200";
assert(taxaPixExternoCentavos(10_000) === 500, `gateway + adicional deu ${taxaPixExternoCentavos(10_000)}`);
delete process.env.PIX_TAXA_GATEWAY_CENTAVOS;
process.env.PIX_TAXA_PERCENTUAL = "texto";
assert(taxaPixExternoCentavos(10_000) === 150, "percentual invalido mudou a taxa fixa");
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;

{
  const kv = kvMemoria();
  const origem = await abrir(kv, "a", 20_000);
  const destino = await abrir(kv, "b", 1_000);
  const antes = envios;
  const consulta = await operarConta(kv, "a", "consulta-a", {
    acao: "consultar_chave",
    valor: "10,00",
    chavePix: destino.chave.toUpperCase(),
  });
  assert(consulta.interno === true && consulta.taxa === "0,00" && consulta.destino === destino.numero, "consulta nao reconheceu a chave");
  assert(consulta.nome === "Ana", "consulta nao trouxe o primeiro nome");
  const enviado = await operarConta(kv, "a", "pix-interno", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: destino.chave,
  });
  assert(enviado.ok && enviado.interno === true && enviado.taxa === "0,00", "PIX interno falhou");
  assert(enviado.avisoDestino?.texto.includes("Sem taxa") !== true, "aviso ao destino falou de taxa");
  assert(enviado.avisoDestino?.texto.includes(origem.numero) === true, "destino nao soube a conta de origem");
  assert((await saldoDe(kv, "a")) === 19_000 && (await saldoDe(kv, "b")) === 2_000, "saldos do PIX interno divergiram");
  assert(envios === antes, "PIX interno chamou a gateway");
  const repetido = await operarConta(kv, "a", "pix-interno", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: destino.chave,
  });
  assert(repetido.ok && repetido.avisoDestino === undefined && (await saldoDe(kv, "a")) === 19_000, "PIX interno repetiu o debito");
  const peloNumero = await operarConta(kv, "a", "pix-numero", {
    acao: "enviar_pix",
    valor: "5,00",
    chavePix: destino.numero,
  });
  assert(peloNumero.ok && peloNumero.interno === true && (await saldoDe(kv, "b")) === 2_500, "numero da conta nao foi reconhecido");
  const proprio = await operarConta(kv, "a", "pix-proprio", {
    acao: "enviar_pix",
    valor: "1,00",
    chavePix: origem.chave,
  });
  assert(proprio.motivo === "mesmo_cliente", "PIX para a propria conta passou");
  const inexistente = await operarConta(kv, "a", "pix-sumiu", {
    acao: "enviar_pix",
    valor: "1,00",
    chavePix: "lb12345678@linhabank",
  });
  assert(inexistente.motivo === "destino_invalido" && envios === antes, "chave interna inexistente foi para a gateway");
}

{
  const kv = kvMemoria();
  await abrir(kv, "c", 20_000);
  process.env.PIX_TAXA_CENTAVOS = "100";
  process.env.PIX_TAXA_PERCENTUAL = "1,00";
  const antes = envios;
  const enviado = await operarConta(kv, "c", "pix-fora", {
    acao: "enviar_pix",
    valor: "100,00",
    chavePix: "ana@email.com",
  });
  const corpo = JSON.parse(ultimoCorpo) as { valorCentavos?: number; chaveDestino?: string };
  assert(enviado.ok && enviado.interno === false && enviado.taxa === "2,00" && enviado.endToEndId === "E2EEXTERNO1", "PIX externo falhou");
  assert(corpo.valorCentavos === 10_000 && corpo.chaveDestino === "ana@email.com", "a gateway recebeu a taxa junto do valor");
  assert((await saldoDe(kv, "c")) === 9_800, "debito nao somou valor e taxa");
  assert(envios === antes + 1, "PIX externo nao chamou a gateway");
  const extrato = await operarConta(kv, "c", "extrato-c", { acao: "extrato" });
  assert(extrato.extrato?.some((item) => item.tipo === "taxa" && item.valor === "-2,00") === true, "extrato sem a taxa");
  delete process.env.PIX_TAXA_CENTAVOS;
  delete process.env.PIX_TAXA_PERCENTUAL;
}

{
  const kv = kvMemoria();
  await abrir(kv, "d", 20_000);
  process.env.PIX_TAXA_CENTAVOS = "250";
  recusar = true;
  const antes = envios;
  const recusado = await operarConta(kv, "d", "pix-recusado", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
  });
  recusar = false;
  delete process.env.PIX_TAXA_CENTAVOS;
  assert(recusado.ok === false && (await saldoDe(kv, "d")) === 20_000, "falha externa nao devolveu valor e taxa");
  assert(envios === antes + 1, "recusa nao tentou a gateway");
}

{
  const kv = kvMemoria();
  const avisos: string[] = [];
  await abrir(kv, "e", 8_000);
  const destino = await abrir(kv, "f", 0);
  const manha = instanteNoBrasil(2026, 11, 15, 8, 0);
  const criado = await criarAgendamento(
    kv,
    "e",
    { valor: "12,00", chavePix: destino.chave, frequencia: "uma_vez", data: "2026-11-20", hora: "09:00" },
    manha,
  );
  assert(criado.ok, criado.texto);
  const antes = envios;
  const rodada = await processarAgendamentos(kv, instanteNoBrasil(2026, 11, 20, 10, 0), async (_chat, texto) => {
    assert(!/gateway|webhook/i.test(texto), "aviso vazou ligacao interna");
    avisos.push(texto);
    return true;
  });
  assert(rodada.enviados === 1 && envios === antes, "PIX agendado interno usou a gateway");
  assert((await saldoDe(kv, "e")) === 6_800 && (await saldoDe(kv, "f")) === 1_200, "agendamento interno movimentou errado");
  assert(avisos.some((texto) => texto.includes("Sem taxa")), "agendamento interno cobrou ou omitiu a taxa");
}

console.log("pix ok");
