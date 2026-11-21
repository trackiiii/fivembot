import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.PIX_GATEWAY_URL = "https://pix.example.test";
process.env.PIX_GATEWAY_TOKEN = "token-de-teste";
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_SQL;

globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("https://pix.example.test/")) {
    return new Response(JSON.stringify({ ok: true, endToEndId: "E2EEXTERNO1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`rede bloqueada no teste: ${new URL(url).host}`);
};

const { aceitarTermos, creditarPixRecebido, operarConta } = await import("../bot/lib/banco.js");
const { interpretarAtualizacao } = await import("../bot/lib/atendimento.js");
const { montarClube } = await import("../bot/lib/clube/painel.js");
const {
  aplicarModo,
  interpretarPedidoUso,
  montarMenu,
  parseAcaoUso,
  telaEscolher,
  telaSaldo,
  tecladoTrocarMenu,
} = await import("../bot/lib/uso/painel.js");
const { lerModoUso } = await import("../bot/lib/uso/store.js");

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

function opcoesIndividuais(teclado: { text: string; callback_data: string }[][]): boolean {
  return teclado.every((linha) => linha.length === 1);
}

assert(parseAcaoUso("u:m")?.tipo === "menu", "callback menu");
assert(parseAcaoUso("u:d")?.tipo === "dialogo", "callback dialogo");
assert(parseAcaoUso("u:e")?.tipo === "escolher", "callback escolher");
assert(parseAcaoUso("u:y")?.tipo === "confirmar", "callback confirmar PIX");
assert(parseAcaoUso("u:q:agabcdef12")?.tipo === "cancelar_agenda", "callback cancelar agenda");
assert(interpretarPedidoUso("quero o menu") === "menu", "frase menu");
assert(interpretarPedidoUso("falar com a Thialinha") === "dialogo", "frase dialogo");
assert(interpretarPedidoUso("/conversa") === "dialogo", "comando conversa");
assert(interpretarPedidoUso("trocar o modo") === "escolher", "frase escolher");
assert(tecladoTrocarMenu()[0]?.[0]?.callback_data === "u:m", "atalho para o menu");

{
  const escolha = telaEscolher();
  assert(escolha.texto.includes("Como deseja operar a conta"), "escolha sem pergunta");
  assert(escolha.teclado.flat().some((item) => item.callback_data === "u:d"), "escolha sem Thialinha");
  assert(escolha.teclado.flat().some((item) => item.callback_data === "u:m"), "escolha sem menu");
  assert(opcoesIndividuais(escolha.teclado), "escolha com botões juntos");
  assert(!/Thialinha:/i.test(escolha.texto), "escolha com prefixo da Thialinha");
  assert(escolha.texto.includes("Thialinha"), "escolha sem o nome da Thialinha");
}

{
  const callback = interpretarAtualizacao({
    update_id: 9,
    callback_query: {
      id: "cb",
      data: "u:m",
      from: { first_name: "Ana", is_bot: false },
      message: { message_id: 4, chat: { id: 11, type: "private" } },
    },
  });
  assert(callback.tipo === "callback" && callback.decisao === "uso", `u:m não foi uso: ${JSON.stringify(callback)}`);
}

{
  const kv = kvMemoria();
  const conta = await aceitarTermos(kv, "11", "Ana Silva");
  await creditarPixRecebido(kv, {
    id: "cred-uso-1",
    referencia: conta.referencia,
    valorCentavos: 10_000,
    endToEndId: "E2EUSO1",
  });
  assert((await lerModoUso(kv, "11")) === undefined, "modo veio preenchido");
  await aplicarModo(kv, "11", "menu");
  assert((await lerModoUso(kv, "11")) === "menu", "menu não gravou");
  const home = await montarMenu(kv, "11");
  assert(home !== undefined, "home do menu vazia");
  if (home === undefined) throw new Error("home do menu vazia");
  assert(home.texto.includes("Disponível: R$ 100,00"), `home sem saldo: ${home.texto}`);
  assert(home.texto.includes("Agência"), "home sem agência");
  assert(home.texto.includes("Cofrinho:"), "home sem cofrinho");
  assert(!/Thialinha/i.test(home.texto), "menu com Thialinha");
  assert(home.teclado[0]?.length === 2, "saldo e extrato não ficaram juntos");
  assert(home.teclado.slice(1).every((linha) => linha.length === 1), "operações financeiras juntas");
  const rotulos = home.teclado.flat().map((item) => item.text);
  assert(rotulos.includes("Receber PIX") && rotulos.includes("Enviar PIX"), "home sem PIX");
  assert(!rotulos.includes("Ajuda"), "ajuda no menu da conta");
  const dados = home.teclado.flat().map((item) => item.callback_data);
  assert(dados.includes("u:s") && dados.includes("u:p") && dados.includes("u:k") && dados.includes("u:b") && dados.includes("u:d"), "home incompleta");
  const saldo = await telaSaldo(kv, "11");
  assert(saldo.texto.includes("R$ 100,00"), `saldo do menu: ${saldo.texto}`);
  assert(saldo.teclado.flat().some((item) => item.callback_data === "u:m"), "saldo sem Voltar");
  assert(opcoesIndividuais(saldo.teclado), "saldo com botões juntos");
  const clube = await montarClube(kv, "11");
  assert(clube !== undefined && clube.teclado.flat().some((item) => item.callback_data === "u:m"), "Club no menu sem Voltar ao menu");
  assert(clube !== undefined && clube.teclado.every((linha) => linha.length === 1), "Club home com opções juntas");
  await aplicarModo(kv, "11", "dialogo");
  assert((await lerModoUso(kv, "11")) === "dialogo", "dialogo não gravou");
  const clubeDialogo = await montarClube(kv, "11");
  assert(
    clubeDialogo !== undefined && !clubeDialogo.teclado.flat().some((item) => item.callback_data === "u:m"),
    "Club no diálogo ainda tem Voltar ao menu",
  );
  const resumo = await operarConta(kv, "11", "uso-saldo", { acao: "resumo" });
  assert(resumo.saldo === "100,00", "saldo mudou ao trocar o modo");
}

console.log("uso ok");
