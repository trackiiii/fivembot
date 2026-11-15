import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

const { contarFalas, CATEGORIAS, classificarTexto, responderLocal } = await import("../bot/lib/conversa/index.js");
const { aceitarTermos, creditarPixRecebido } = await import("../bot/lib/banco.js");

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

const contagem = contarFalas();
assert(contagem.total >= 100, `biblioteca curta: ${contagem.total}`);
for (const categoria of CATEGORIAS) {
  assert((contagem.porCategoria[categoria] ?? 0) >= 4, `${categoria} com poucas falas`);
}

assert(classificarTexto("oii").categoria === "saudacoes", "oi não foi saudação");
assert(classificarTexto("quem é você?").categoria === "apresentacao", "apresentação falhou");
assert(classificarTexto("qual é o meu saldo?").categoria === "saldo", "saldo falhou");
assert(classificarTexto("quero depositar").categoria === "depositos", "depósito falhou");
assert(classificarTexto("segue o comprovante, já paguei").categoria === "comprovantes", "comprovante falhou");
assert(classificarTexto("valeu demais").categoria === "agradecimentos", "agradecimento falhou");
assert(classificarTexto("tchau").categoria === "despedidas", "despedida falhou");
assert(classificarTexto("manda 50 pro ana@email.com").categoria === "modelo", "envio complexo foi local");
assert(classificarTexto("quero agendar um pix").categoria === "modelo", "agendar foi local");

{
  const kv = kvMemoria();
  const a = await responderLocal(kv, "1", "oii", "Ana", false, true, "f1");
  const b = await responderLocal(kv, "1", "oii", "Ana", false, false, "f2");
  assert(a.tipo === "texto" && b.tipo === "texto", "saudação foi para o modelo");
  if (a.tipo !== "texto" || b.tipo !== "texto") throw new Error("saudação foi para o modelo");
  assert(a.categoria === "apresentacao", "histórico vazio não apresentou");
  assert(a.falaId !== b.falaId, "repetiu a fala seguida");
  assert(a.texto.includes("Ana") || a.texto.includes("Thialinha"), "apresentação sem nome ou identidade");
}

{
  const kv = kvMemoria();
  const semConta = await responderLocal(kv, "2", "qual meu saldo", "Bia", false, false, "s1");
  assert(semConta.tipo === "texto" && semConta.categoria === "cadastro", "saldo sem conta não pediu cadastro");
  if (semConta.tipo !== "texto") throw new Error("saldo sem conta não pediu cadastro");
  assert(!/R\$\s*\d/.test(semConta.texto), "inventou saldo sem conta");
}

{
  const kv = kvMemoria();
  const conta = await aceitarTermos(kv, "3", "Carla Souza");
  await creditarPixRecebido(kv, {
    id: "cred-conv-1",
    referencia: conta.referencia,
    valorCentavos: 1234,
    endToEndId: "E2ECONV1",
  });
  const local = await responderLocal(kv, "3", "qual é o meu saldo?", "Carla", true, false, "s2");
  assert(local.tipo === "texto" && local.categoria === "saldo", "saldo com conta não usou biblioteca");
  if (local.tipo !== "texto") throw new Error("saldo com conta não usou biblioteca");
  assert(local.texto.includes("12,34"), "saldo não veio do backend");
}

{
  const kv = kvMemoria();
  const comprovante = await responderLocal(kv, "4", "segue o comprovante já paguei 80 reais", "Duda", true, false, "c1");
  assert(comprovante.tipo === "texto" && comprovante.categoria === "comprovantes", "comprovante não foi local");
  if (comprovante.tipo !== "texto") throw new Error("comprovante não foi local");
  assert(!/R\$\s*80/.test(comprovante.texto), "creditou pelo comprovante");
}

{
  const kv = kvMemoria();
  const complexo = await responderLocal(kv, "5", "manda 50,00 pra ana@email.com", "Eva", true, false, "p1");
  assert(complexo.tipo === "modelo", "PIX complexo não foi para o modelo");
}

console.log(`conversa ok (${contagem.total} falas)`);
