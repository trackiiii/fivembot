import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;
delete process.env.LINHABANK_SQL;
delete process.env.ASAAS_API_KEY;

const { aceitarTermos, bloquearConta, creditarPixRecebido, operarConta } = await import("../bot/lib/banco.js");
const { interpretarPedido } = await import("../bot/lib/cofrinho/servico.js");
const { executarTexto, guardarCofrinho, resgatarCofrinho } = await import("../bot/lib/cofrinho/servico.js");
const { listarCofrinhos } = await import("../bot/lib/cofrinho/store.js");
const { aplicarAcao } = await import("../bot/lib/admin/painel.js");
const { gravarConfig } = await import("../bot/lib/config.js");
const { responderLocal } = await import("../bot/lib/conversa/index.js");

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

async function saldoDe(kv: HostKvApi, chatId: string): Promise<number> {
  const conta = await operarConta(kv, chatId, `saldo:${chatId}:${Math.random()}`, { acao: "resumo" });
  const [reais, cents] = (conta.saldo ?? "0,00").replace("-", "").split(",");
  const valor = Number(reais) * 100 + Number(cents ?? "0");
  return (conta.saldo ?? "").startsWith("-") ? -valor : valor;
}

{
  const criar = interpretarPedido("criar cofrinho viagem meta 1000");
  assert(criar.tipo === "criar" && criar.nome === "viagem" && criar.metaCentavos === 100_000, "criar com meta");
  const guardar = interpretarPedido("guardar 50,00 no cofrinho viagem");
  assert(guardar.tipo === "guardar" && guardar.nome === "viagem" && guardar.centavos === 5_000, "guardar com nome");
  const lista = interpretarPedido("quanto tenho no cofrinho");
  assert(lista.tipo === "listar", "consulta não é movimento");
  const tudo = interpretarPedido("resgatar tudo do cofrinho");
  assert(tudo.tipo === "resgatar" && tudo.tudo === true, "resgatar tudo");
}

{
  const kv = kvMemoria();
  const ana = await aceitarTermos(kv, "1", "Ana");
  await creditarPixRecebido(kv, { id: "cred-cof", referencia: ana.referencia, valorCentavos: 10_000, endToEndId: "E2ECOF" });
  const criado = await executarTexto(kv, "1", "criar cofrinho viagem meta 200", "criar-1");
  assert(criado.includes("viagem") && criado.includes("zerado"), `não criou: ${criado}`);
  const guardou = await executarTexto(kv, "1", "guardar 40 no cofrinho viagem", "guarda-1");
  assert(guardou.includes("40,00") && guardou.includes("Cofrinho: R$ 40,00") && guardou.includes("Conta: R$ 60,00"), guardou);
  assert((await saldoDe(kv, "1")) === 6_000, "guardar não tirou da conta");
  const repetiu = await executarTexto(kv, "1", "guardar 40 no cofrinho viagem", "guarda-1");
  assert((await saldoDe(kv, "1")) === 6_000, `idempotência debitou de novo: ${repetiu}`);
  const curto = await executarTexto(kv, "1", "guardar 70 no cofrinho", "guarda-2");
  assert(curto.includes("Não deu"), curto);
  assert((await saldoDe(kv, "1")) === 6_000, "saldo insuficiente mexeu na conta");
  const bia = await aceitarTermos(kv, "2", "Bia");
  const potes = await listarCofrinhos(kv, "1");
  const alheio = await resgatarCofrinho(kv, "2", potes[0]?.id ?? "", 1_000, "alheio");
  assert(alheio.ok === false, "outro chat resgatou o cofrinho");
  assert((await saldoDe(kv, "2")) === 0, "resgate alheio creditou");
  const pix = await operarConta(kv, "1", "pix-disponivel", { acao: "enviar_pix", valor: "70,00", chavePix: bia.chaveInterna });
  assert(pix.ok === false && pix.motivo === "saldo_insuficiente", "PIX usou o dinheiro do cofrinho");
  const pixOk = await operarConta(kv, "1", "pix-disponivel-ok", { acao: "enviar_pix", valor: "60,00", chavePix: bia.chaveInterna });
  assert(pixOk.ok === true && pixOk.interno === true, "PIX do disponível falhou");
  assert((await saldoDe(kv, "1")) === 0, "PIX não usou só o disponível");
  const potesDepois = await listarCofrinhos(kv, "1");
  assert(potesDepois[0]?.saldoCentavos === 4_000, "PIX mexeu no cofrinho");
  await creditarPixRecebido(kv, { id: "cred-cof-2", referencia: ana.referencia, valorCentavos: 1_000, endToEndId: "E2ECOF2" });
  await bloquearConta(kv, "1", true);
  const parado = await executarTexto(kv, "1", "guardar 10 no cofrinho viagem", "guarda-off");
  assert(parado.includes("desativada"), parado);
  const voltou = await executarTexto(kv, "1", "resgatar 10 do cofrinho viagem", "resgata-off");
  assert(voltou.includes("Resgatei R$ 10,00") && voltou.includes("Cofrinho: R$ 30,00"), voltou);
  assert((await saldoDe(kv, "1")) === 2_000, "resgate com conta desativada não devolveu");
  const preso = await executarTexto(kv, "1", "encerrar cofrinho viagem", "encerra-cheio");
  assert(preso.includes("Resgata antes"), preso);
  await bloquearConta(kv, "1", false);
  const esvaziou = await executarTexto(kv, "1", "resgatar tudo do cofrinho viagem", "resgata-tudo");
  assert(esvaziou.includes("Resgatei R$ 30,00") && esvaziou.includes("Cofrinho: R$ 0,00"), esvaziou);
  const encerrou = await executarTexto(kv, "1", "encerrar cofrinho viagem", "encerra");
  assert(encerrou.includes("Encerrei"), encerrou);
  assert((await listarCofrinhos(kv, "1")).length === 0, "encerrado ainda aparece como ativo");
  await gravarConfig(kv, { chatsAdmin: "9" });
  const criadoDeNovo = await executarTexto(kv, "1", "criar cofrinho reserva", "criar-2");
  assert(criadoDeNovo.includes("reserva"), criadoDeNovo);
  const ficha = await aplicarAcao(kv, "9", "a:d:0");
  assert(ficha.tela.texto.includes("Cofrinhos: 1"), `ficha sem cofrinho: ${ficha.tela.texto}`);
  assert(ficha.tela.teclado.flat().some((item) => item.callback_data === "a:cf:0"), "ficha sem botão de cofrinho");
  const tela = await aplicarAcao(kv, "9", "a:cf:0");
  assert(tela.tela.texto.includes("reserva") && tela.tela.teclado.flat().some((item) => item.callback_data === "a:d:0"), tela.tela.texto);
  assert(!/Thialinha/i.test(tela.tela.texto), "gerência do cofrinho com Thialinha");
  const conversa = await responderLocal(kv, "1", "quanto tenho no cofrinho", "Ana", true, false, "fala-cof");
  assert(conversa.tipo === "texto" && conversa.texto.includes("reserva") && conversa.texto.includes("0,00"), `consulta inventou: ${conversa.tipo === "texto" ? conversa.texto : conversa.tipo}`);
}

process.env.LINHABANK_SQL = "memoria";
{
  const { aceitarTermos: aceitarSql, creditarPixRecebido: creditarSql, operarConta: operarSql } = await import("../bot/lib/banco.js");
  const { executarTexto: executarSql } = await import("../bot/lib/cofrinho/servico.js");
  const { listarCofrinhos: listarSql } = await import("../bot/lib/cofrinho/store.js");
  const kv = kvMemoria();
  const ana = await aceitarSql(kv, "sql-cof", "Ana");
  await creditarSql(kv, { id: "sql-cof-cred", referencia: ana.referencia, valorCentavos: 8_000, endToEndId: "E2ESQLCOF" });
  await executarSql(kv, "sql-cof", "criar cofrinho viagem", "sql-criar");
  const guardou = await executarSql(kv, "sql-cof", "guardar 25 no cofrinho viagem", "sql-guarda");
  assert(guardou.includes("Cofrinho: R$ 25,00") && guardou.includes("Conta: R$ 55,00"), guardou);
  const saldo = await operarSql(kv, "sql-cof", "sql-saldo", { acao: "resumo" });
  assert(saldo.saldo === "55,00", `SQL não separou o disponível: ${saldo.saldo}`);
  const potes = await listarSql(kv, "sql-cof");
  assert(potes[0]?.saldoCentavos === 2_500, "SQL não creditou o cofrinho");
  const deNovo = await executarSql(kv, "sql-cof", "guardar 25 no cofrinho viagem", "sql-guarda");
  const saldo2 = await operarSql(kv, "sql-cof", "sql-saldo-2", { acao: "resumo" });
  assert(saldo2.saldo === "55,00", "SQL repetiu o guardar");
  const resgate = await executarSql(kv, "sql-cof", "resgatar 10 do cofrinho viagem", "sql-resgata");
  assert(resgate.includes("Cofrinho: R$ 15,00") && resgate.includes("Conta: R$ 65,00"), resgate);
}

console.log("cofrinho ok");
