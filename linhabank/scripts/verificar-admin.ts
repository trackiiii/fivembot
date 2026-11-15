import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.LINHABANK_MODO = "sandbox";
process.env.ADMIN_TOKEN = "token-admin-teste";
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;
delete process.env.LINHABANK_ADMIN_CHATS;

const { aceitarTermos, bloquearConta, operarConta } = await import("../bot/lib/banco.js");
const { interpretarAtualizacao } = await import("../bot/lib/atendimento.js");
const { garantirConfig, gravarConfig, configAtual } = await import("../bot/lib/config.js");
const { taxaPixExternoCentavos } = await import("../bot/lib/taxa.js");
const { ehAdmin, modoCarteira } = await import("../bot/lib/modo.js");
const {
  aplicarAcao,
  aplicarTextoAdmin,
  lerComandoAdmin,
  montarTela,
  parseAcao,
  tentarAbrirAdmin,
} = await import("../bot/lib/admin/painel.js");

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

function botoes(tela: { teclado: { text: string; callback_data: string }[][] }): string[] {
  return tela.teclado.flat().map((item) => item.callback_data);
}

function semIa(texto: string): void {
  assert(!/Oii|Perfeitooo|Thialinha|inteligência artificial|\bIA\b|feito por|botões neste chat/i.test(texto), `painel informal: ${texto}`);
}

{
  assert(lerComandoAdmin("/admin") !== undefined, "/admin não reconhecido");
  assert(lerComandoAdmin("/admin@linhabank_bot token-admin-teste")?.token === "token-admin-teste", "token do /admin");
  assert(lerComandoAdmin("saldo") === undefined, "saldo não é /admin");
  assert(parseAcao("a:g")?.tipo === "aba", "botão Tarifas");
  assert(parseAcao("a:k:f")?.tipo === "pedir", "botão tarifa");
  assert((parseAcao("a:k:m") as { campo?: string }).campo === "canalMovimento", "botão canal de movimento");
  assert(parseAcao("a:b:0")?.tipo === "bloquear", "botão bloquear");
  assert(parseAcao("a:d:0")?.tipo === "aba", "botão ficha");
  assert(parseAcao("a:j:0")?.tipo === "cartao", "botão cartão");
  assert(parseAcao("a:y:1")?.tipo === "cancelar_pix", "botão cancelar PIX");
  assert((parseAcao("a:x:2") as { indice?: number }).indice === 2, "índice liquidar PIX");
  const todos = ["a:v", "a:c", "a:p", "a:l", "a:g", "a:ms", "a:ml", "a:my", "a:z", "a:r", "a:t:p", "a:t:b", "a:q", "a:k:m"];
  for (const dados of todos) {
    assert(parseAcao(dados) !== undefined, `callback ${dados}`);
    assert(dados.length <= 64, `callback longo ${dados}`);
  }
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
  assert(ehAdmin("7069054484"), "7069054484 deveria já ser admin");
  assert((await tentarAbrirAdmin(kv, "7069054484")) === "ok", "admin fixo pediu token");
  assert((await tentarAbrirAdmin(kv, "1001")) === "pedir_token", "admin sem token passou");
  assert((await tentarAbrirAdmin(kv, "1001", "errado-admin-teste")) === "negado", "token errado passou");
  assert((await tentarAbrirAdmin(kv, "1001", "token-admin-teste")) === "ok", "bootstrap do /admin falhou");
  assert(ehAdmin("1001"), "chat não entrou na lista admin");
  assert((await tentarAbrirAdmin(kv, "1001")) === "ok", "admin já liberado pediu token de novo");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const visao = await montarTela(kv, "1001");
  assert(visao.texto.includes("LINHABANK"), "painel sem instituição");
  assert(visao.texto.includes("Gerência de contas"), "painel sem gerência");
  assert(visao.texto.includes("Custódia"), "painel sem custódia");
  assert(visao.texto.includes("homologação"), "painel sem ambiente");
  semIa(visao.texto);
  const dados = botoes(visao);
  assert(dados.includes("a:g") && dados.includes("a:ms"), "visão sem tarifas/ambiente");
  assert(dados.every((item) => item.startsWith("a:") && item.length <= 64), "callback fora do padrão");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const live = await aplicarAcao(kv, "1001", "a:ml");
  assert(live.tela.teclado.flat().some((b) => b.callback_data === "a:my"), "produção sem confirmar");
  semIa(live.tela.texto);
  assert(modoCarteira() === "sandbox", "produção mudou sem confirmar");
  await aplicarAcao(kv, "1001", "a:my");
  assert(modoCarteira() === "live", "confirmar produção falhou");
  const sandbox = await aplicarAcao(kv, "1001", "a:ms");
  assert(modoCarteira() === "sandbox" && (sandbox.aviso ?? "").includes("homologação"), "voltar homologação falhou");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  assert(taxaPixExternoCentavos(10_000) === 0, "tarifa inicial não é zero");
  await aplicarAcao(kv, "1001", "a:k:f");
  const salvo = await aplicarTextoAdmin(kv, "1001", "150");
  assert(salvo !== undefined && configAtual().taxaCentavos === 150, "tarifa pelo botão não gravou");
  await aplicarAcao(kv, "1001", "a:k:e");
  await aplicarTextoAdmin(kv, "1001", "1,50");
  assert(taxaPixExternoCentavos(10_000) === 300, `tarifa do painel deu ${taxaPixExternoCentavos(10_000)}`);
  await aplicarAcao(kv, "1001", "a:k:h");
  await aplicarTextoAdmin(kv, "1001", "admin@linhabank.test");
  assert(configAtual().chaveRecebimento === "admin@linhabank.test", "chave não veio do painel");
  await aplicarAcao(kv, "1001", "a:k:m");
  const canalInvalido = await aplicarTextoAdmin(kv, "1001", "abc");
  assert((canalInvalido?.tela.aviso ?? "").includes("inválido"), "canal inválido passou");
  const canal = await aplicarTextoAdmin(kv, "1001", "-1001234567890");
  assert(canal !== undefined && configAtual().canalMovimento === "-1001234567890", "canal de movimento não gravou");
  assert((canal?.tela.texto ?? "").includes("Canal de movimento: -1001234567890"), "tarifas sem o canal gravado");
  const prefixo = await aplicarAcao(kv, "1001", "a:t:p");
  assert(configAtual().prefixoThialinha === false, "identificação no atendimento não desligou");
  assert(prefixo.tela.texto.includes("Parametrização"), "depois do toggle não voltou à parametrização");
  semIa(prefixo.tela.texto);
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const conta = await aceitarTermos(kv, "77", "Ana");
  const lista = await aplicarAcao(kv, "1001", "a:c");
  assert(lista.tela.texto.includes("Ana"), "contas sem a titular");
  assert(lista.tela.teclado.flat().some((b) => b.callback_data === "a:b:0"), "contas sem bloquear");
  assert(lista.tela.teclado.flat().some((b) => b.callback_data === "a:d:0"), "contas sem ficha");
  const ficha = await aplicarAcao(kv, "1001", "a:d:0");
  assert(ficha.tela.texto.includes("Ficha cadastral"), "ficha não abriu");
  assert(ficha.tela.texto.includes(conta.numero), "ficha sem número");
  assert(ficha.tela.texto.includes("Agência"), "ficha sem agência");
  assert(ficha.tela.texto.includes("Cartão virtual"), "ficha sem cartão");
  semIa(ficha.tela.texto);
  const bloqueada = await aplicarAcao(kv, "1001", "a:b:0");
  assert((bloqueada.aviso ?? "").includes("bloqueada"), "bloquear pela gerência falhou");
  const cartao = await aplicarAcao(kv, "1001", "a:j:0");
  assert((cartao.aviso ?? "").includes("Cartão"), "bloquear cartão falhou");
  const extrato = await aplicarAcao(kv, "1001", "a:e:0");
  assert(extrato.tela.texto.includes("Extrato"), "extrato gerencial não abriu");
  await aplicarAcao(kv, "1001", "a:q");
  const busca = await aplicarTextoAdmin(kv, "1001", conta.numero);
  assert(busca?.tela.texto.includes("Ficha cadastral") === true, "localizar conta não abriu a ficha");
  const livre = await bloquearConta(kv, "77", false);
  assert(livre?.status === "ativa", "liberar depois do painel falhou");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  await aceitarTermos(kv, "77", "Ana");
  const deposito = await operarConta(kv, "77", "dep-admin", { acao: "depositar", valor: "25,00" });
  assert(deposito.ok === true, "depósito do teste admin falhou");
  const pix = await aplicarAcao(kv, "1001", "a:p");
  assert(pix.tela.texto.includes("Tesouraria PIX"), "tesouraria sem título");
  semIa(pix.tela.texto);
  assert(pix.tela.teclado.flat().some((b) => b.callback_data === "a:x:0"), "PIX sem liquidar");
  assert(pix.tela.teclado.flat().some((b) => b.callback_data === "a:y:0"), "PIX sem cancelar");
  const pago = await aplicarAcao(kv, "1001", "a:x:0");
  assert(pago.aviso === "Liquidação registrada.", `sandbox pagar: ${pago.aviso}`);
  assert(pago.avisoCliente?.chatId === "77", "cliente não foi avisado");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  await aceitarTermos(kv, "88", "Bia");
  const deposito = await operarConta(kv, "88", "dep-cancel", { acao: "depositar", valor: "10,00" });
  assert(deposito.ok === true, "depósito para cancelar falhou");
  const cancelado = await aplicarAcao(kv, "1001", "a:y:0");
  assert(cancelado.aviso === "Cobrança cancelada.", `cancelar: ${cancelado.aviso}`);
}

{
  const cb = interpretarAtualizacao({
    update_id: 21,
    callback_query: {
      id: "cb-admin",
      data: "a:g",
      from: { first_name: "Ana", is_bot: false },
      message: { message_id: 8, chat: { id: 1001, type: "private" } },
    },
  });
  assert(cb.tipo === "callback" && cb.decisao === "admin" && cb.dados === "a:g", "callback admin não chegou");
  const termos = interpretarAtualizacao({
    update_id: 22,
    callback_query: {
      id: "cb-termos",
      data: "termos:concordo",
      from: { first_name: "Ana", is_bot: false },
      message: { message_id: 9, chat: { id: 77, type: "private" } },
    },
  });
  assert(termos.tipo === "callback" && termos.decisao === "concordo", "termos quebraram");
}

{
  const originalFetch = globalThis.fetch;
  const gatewayUrl = process.env.PIX_GATEWAY_URL;
  const gatewayToken = process.env.PIX_GATEWAY_TOKEN;
  delete process.env.PIX_GATEWAY_URL;
  delete process.env.PIX_GATEWAY_TOKEN;
  if ((process.env.ASAAS_API_KEY ?? "").trim().length < 20) {
    process.env.ASAAS_API_KEY = "$aact_prod_linhabank_test_key_00000000";
  }
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/v3/myAccount/fees")) {
      return new Response(
        JSON.stringify({
          payment: { pix: { fixedFeeValue: 0.99, percentageFee: 0 } },
          transfer: { monthlyTransfersWithoutFee: 30, pix: { feeValue: 2 } },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`rede bloqueada no teste admin: ${new URL(url).host}`);
  };
  try {
    const kv = kvMemoria();
    await gravarConfig(kv, { chatsAdmin: "1001", taxaCentavos: 150, taxaPercentual: "1,50" });
    const atualizado = await aplicarAcao(kv, "1001", "a:r");
    assert(configAtual().taxaGatewayCentavos === 200, `custo da gateway ${configAtual().taxaGatewayCentavos}`);
    assert(configAtual().taxaCentavos === 150, "atualizar apagou o adicional");
    assert(configAtual().taxaPercentual === "1,50", "atualizar apagou o adicional percentual");
    assert((atualizado.aviso ?? "").includes("Adicional LinhaBank inalterado"), `aviso atualizar: ${atualizado.aviso}`);
    await aplicarAcao(kv, "1001", "a:g");
    const tarifas = await montarTela(kv, "1001");
    assert(tarifas.texto.includes("Custo da gateway (envio): R$ 2,00"), "tarifas sem o custo da gateway");
    assert(tarifas.texto.includes("Adicional LinhaBank: R$ 1,50 + 1,50%"), "tarifas sem o adicional");
    assert(tarifas.texto.includes("recebimento: R$ 0,99"), "tarifas sem a tarifa de recebimento da gateway");
    assert(taxaPixExternoCentavos(10_000) === 500, `PIX externo sem soma gateway+adicional: ${taxaPixExternoCentavos(10_000)}`);
    await aplicarAcao(kv, "1001", "a:k:f");
    await aplicarTextoAdmin(kv, "1001", "50");
    assert(configAtual().taxaCentavos === 50 && configAtual().taxaGatewayCentavos === 200, "adicional não ficou personalizável");
    assert(taxaPixExternoCentavos(10_000) === 400, "adicional novo não entrou no PIX externo");
  } finally {
    globalThis.fetch = originalFetch;
    if (gatewayUrl === undefined) delete process.env.PIX_GATEWAY_URL;
    else process.env.PIX_GATEWAY_URL = gatewayUrl;
    if (gatewayToken === undefined) delete process.env.PIX_GATEWAY_TOKEN;
    else process.env.PIX_GATEWAY_TOKEN = gatewayToken;
  }
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
  assert(modoCarteira() === "sandbox", "kv vazio não voltou ao padrão");
}

console.log("admin ok");
