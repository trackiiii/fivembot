import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.LINHABANK_MODO = "sandbox";
process.env.ADMIN_TOKEN = "token-admin-teste";
delete process.env.PIX_TAXA_CENTAVOS;
delete process.env.PIX_TAXA_PERCENTUAL;
delete process.env.PIX_TAXA_GATEWAY_CENTAVOS;
delete process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_CENTAVOS;
delete process.env.PIX_TAXA_GATEWAY_RECEBIMENTO_PERCENTUAL;
delete process.env.LINHABANK_ADMIN_CHATS;

const { aceitarTermos, bloquearConta, buscarContaLinhaBank, lerConta, operarConta } = await import(
  "../bot/lib/banco.js"
);
const { interpretarAtualizacao } = await import("../bot/lib/atendimento.js");
const { garantirConfig, gravarConfig, configAtual } = await import("../bot/lib/config.js");
const { taxaPixExternoCentavos, taxaPixExternoRecebimentoCentavos } = await import("../bot/lib/taxa.js");
const { ehAdmin, modoCarteira } = await import("../bot/lib/modo.js");
const {
  aplicarAcao,
  aplicarMidiaAdmin,
  aplicarTextoAdmin,
  lerComandoAdmin,
  montarTela,
  parseAcao,
  tentarAbrirAdmin,
} = await import("../bot/lib/admin/painel.js");
const { textoClienteAnuncio } = await import("../bot/lib/admin/anuncio.js");
const { RESPOSTA_MANUTENCAO } = await import("../bot/lib/respostas.js");

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

function temVoltar(tela: { teclado: { text: string; callback_data: string }[][] }, callback: string): boolean {
  return tela.teclado.flat().some((item) => item.text.includes("Voltar") && item.callback_data === callback);
}

function opcoesIndividuais(tela: { teclado: { text: string; callback_data: string }[][] }): boolean {
  return tela.teclado
    .filter((row) => !row.some((item) => item.text === "Anterior" || item.text === "Próxima"))
    .every((row) => row.length === 1);
}

function semIa(texto: string): void {
  assert(!/Oii|Perfeitooo|Thialinha|inteligência artificial|\bIA\b|feito por|botões neste chat/i.test(texto), `painel informal: ${texto}`);
}

{
  assert(lerComandoAdmin("/admin") !== undefined, "/admin não reconhecido");
  assert(lerComandoAdmin("/admin@linhabank_bot token-admin-teste")?.token === "token-admin-teste", "token do /admin");
  assert(lerComandoAdmin("saldo") === undefined, "saldo não é /admin");
  assert(parseAcao("a:g")?.tipo === "aba", "botão Ajustes");
  assert(parseAcao("a:n")?.tipo === "aba", "botão Anúncio");
  assert(parseAcao("a:nl")?.tipo === "anuncio_limpar", "botão limpar anúncio");
  assert(parseAcao("a:np")?.tipo === "anuncio_previa", "botão prévia anúncio");
  assert(parseAcao("a:ns")?.tipo === "anuncio_enviar", "botão enviar anúncio");
  assert(parseAcao("a:ny")?.tipo === "anuncio_confirmar", "botão confirmar anúncio");
  assert(parseAcao("a:o")?.tipo === "aba", "botão Mais opções");
  assert(parseAcao("a:k:f")?.tipo === "pedir", "botão tarifa");
  assert((parseAcao("a:k:m") as { campo?: string }).campo === "canalMovimento", "botão canal de movimento");
  assert(parseAcao("a:b:0")?.tipo === "bloquear", "botão desativar");
  assert((parseAcao("a:en:0") as { campo?: string }).campo === "clienteNome", "botão titular");
  assert((parseAcao("a:eg:0") as { campo?: string }).campo === "clienteAgencia", "botão agência");
  assert((parseAcao("a:eu:0") as { campo?: string }).campo === "clienteNumero", "botão número");
  assert((parseAcao("a:ek:0") as { campo?: string }).campo === "clienteChave", "botão chave");
  assert((parseAcao("a:ef:0") as { campo?: string }).campo === "clienteCartao", "botão final cartão");
  assert(parseAcao("a:d:0")?.tipo === "aba", "botão ficha");
  assert(parseAcao("a:j:0")?.tipo === "cartao", "botão cartão");
  assert(parseAcao("a:y:1")?.tipo === "cancelar_pix", "botão cancelar PIX");
  assert((parseAcao("a:x:2") as { indice?: number }).indice === 2, "índice liquidar PIX");
  assert(parseAcao("a:h")?.tipo === "aba", "botão Clube");
  assert(parseAcao("a:ic:m")?.tipo === "criterio", "botão critério análise");
  assert(parseAcao("a:ia:0")?.tipo === "aprovar_indicacao", "botão aprovar indicação");
  assert(parseAcao("a:ir:0")?.tipo === "rejeitar_indicacao", "botão recusar indicação");
  assert((parseAcao("a:k:l") as { campo?: string }).campo === "lbcoinsIndicacao", "botão LBcoins indicação");
  assert(parseAcao("a:t:m")?.tipo === "toggle", "botão manutenção");
  assert(parseAcao("a:t:v")?.tipo === "toggle", "botão voz");
  const todos = ["a:v", "a:c", "a:p", "a:l", "a:g", "a:n", "a:nl", "a:np", "a:ns", "a:ny", "a:o", "a:ms", "a:ml", "a:my", "a:z", "a:r", "a:t:p", "a:t:v", "a:t:b", "a:t:m", "a:q", "a:k:m", "a:h", "a:ic:m", "a:ic:c", "a:k:l", "a:en:0", "a:eg:0", "a:eu:0", "a:ek:0", "a:ef:0", "a:b:0"];
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
  assert(visao.texto.includes("Gerência"), "painel sem gerência");
  assert(visao.texto.includes("Saldo das contas"), "painel sem saldo");
  assert(visao.texto.includes("homologação"), "painel sem ambiente");
  semIa(visao.texto);
  const dados = botoes(visao);
  assert(dados.includes("a:g") && dados.includes("a:ms") && dados.includes("a:n") && dados.includes("a:h") && dados.includes("a:t:m"), "visão sem tarifas/ambiente/anúncio/clube/manutenção");
  assert(visao.texto.includes("Manutenção: desligada"), "visão sem estado da manutenção");
  assert(opcoesIndividuais(visao), "início com opções juntas");
  assert(!temVoltar(visao, "a:v"), "início não deve ter voltar");
  assert(dados.every((item) => item.startsWith("a:") && item.length <= 64), "callback fora do padrão");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const live = await aplicarAcao(kv, "1001", "a:ml");
  assert(live.tela.teclado.flat().some((b) => b.callback_data === "a:my"), "produção sem confirmar");
  assert(temVoltar(live.tela, "a:v"), "produção sem voltar");
  assert(opcoesIndividuais(live.tela), "produção com botões juntos");
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
  const salvo = await aplicarTextoAdmin(kv, "1001", "1,50");
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
  assert((canal?.tela.texto ?? "").includes("Canal Telegram: -1001234567890"), "ajustes sem o canal gravado");
  assert(temVoltar(canal!.tela, "a:v"), "ajustes sem voltar");
  assert(opcoesIndividuais(canal!.tela), "ajustes com opções juntas");
  await aplicarAcao(kv, "1001", "a:g");
  await aplicarAcao(kv, "1001", "a:k:f");
  const voltouAjuste = await aplicarAcao(kv, "1001", "a:z");
  assert(voltouAjuste.tela.texto.includes("Ajustes"), "voltar da edição não ficou nos ajustes");
  assert((voltouAjuste.aviso ?? "").includes("cancelada"), "voltar da edição sem cancelar o pedido");
  const prefixo = await aplicarAcao(kv, "1001", "a:t:p");
  assert(configAtual().prefixoThialinha === false, "identificação no atendimento não desligou");
  assert(prefixo.tela.texto.includes("Mais opções"), "depois do toggle não voltou às opções");
  const voz = await aplicarAcao(kv, "1001", "a:t:v");
  assert(configAtual().vozThialinha === false, "voz da Thialinha não desligou");
  assert(voz.tela.teclado.flat().some((item) => item.text === "Voz: off"), "botão da voz não ficou off");
  assert(temVoltar(prefixo.tela, "a:g"), "mais opções sem voltar aos ajustes");
  assert(opcoesIndividuais(prefixo.tela), "mais opções com botões juntos");
  semIa(prefixo.tela.texto);
  const manutencao = await aplicarAcao(kv, "1001", "a:t:m");
  assert(configAtual().manutencao === true, "manutenção não ligou");
  assert((manutencao.aviso ?? "").includes("ligada"), "aviso de manutenção ligada falhou");
  assert(manutencao.tela.texto.includes("Manutenção: ligada"), "início sem manutenção ligada");
  assert(manutencao.tela.teclado.flat().some((item) => item.text === "Manutenção: on"), "botão não ficou on");
  assert(RESPOSTA_MANUTENCAO.includes("MANUTENÇÃO PROGRAMADA"), "aviso ao cliente sem título");
  assert(RESPOSTA_MANUTENCAO.includes("Sua vida financeira, ainda mais simples."), "aviso ao cliente incompleto");
  const desliga = await aplicarAcao(kv, "1001", "a:t:m");
  assert(configAtual().manutencao === false, "manutenção não desligou");
  assert((desliga.aviso ?? "").includes("desligada"), "aviso de manutenção desligada falhou");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const conta = await aceitarTermos(kv, "77", "Ana");
  const lista = await aplicarAcao(kv, "1001", "a:c");
  assert(lista.tela.texto.includes("Ana"), "contas sem a titular");
  assert(lista.tela.teclado.flat().some((b) => b.callback_data === "a:b:0"), "contas sem desativar");
  assert(lista.tela.teclado.flat().some((item) => item.text === "Desativar"), "lista sem Ativar/Desativar");
  assert(lista.tela.teclado.flat().some((b) => b.callback_data === "a:d:0"), "contas sem ficha");
  assert(temVoltar(lista.tela, "a:v"), "contas sem voltar");
  assert(!botoes(lista.tela).includes("a:p") && !botoes(lista.tela).includes("a:g"), "contas ainda com as outras abas");
  assert(opcoesIndividuais(lista.tela), "contas com opções juntas");
  const ficha = await aplicarAcao(kv, "1001", "a:d:0");
  assert(ficha.tela.texto.includes("Ficha cadastral"), "ficha não abriu");
  assert(ficha.tela.texto.includes(conta.numero), "ficha sem número");
  assert(ficha.tela.texto.includes("Agência"), "ficha sem agência");
  assert(ficha.tela.texto.includes("Telegram: 77"), "ficha sem chat id");
  assert(ficha.tela.texto.includes("Cartão virtual"), "ficha sem cartão");
  assert(ficha.tela.teclado.flat().some((item) => item.text === "Titular" && item.callback_data === "a:en:0"), "ficha sem editar titular");
  assert(ficha.tela.teclado.flat().some((item) => item.text === "Desativar conta"), "ficha sem desativar");
  assert(temVoltar(ficha.tela, "a:c"), "ficha sem voltar às contas");
  assert(opcoesIndividuais(ficha.tela), "ficha com opções juntas");
  semIa(ficha.tela.texto);
  const desativada = await aplicarAcao(kv, "1001", "a:b:0");
  assert((desativada.aviso ?? "").includes("desativada"), "desativar pela gerência falhou");
  assert(desativada.avisoCliente?.chatId === "77", "cliente não foi avisado da desativação");
  const pixParado = await operarConta(kv, "77", "pix-desativada", {
    acao: "enviar_pix",
    valor: "10,00",
    chavePix: "ana@email.com",
  });
  assert(pixParado.ok === false && pixParado.motivo === "conta_bloqueada", "conta desativada enviou PIX");
  const ativada = await aplicarAcao(kv, "1001", "a:b:0");
  assert((ativada.aviso ?? "").includes("ativada"), "ativar pela gerência falhou");
  const cartao = await aplicarAcao(kv, "1001", "a:j:0");
  assert((cartao.aviso ?? "").includes("Cartão"), "bloquear cartão falhou");
  const extrato = await aplicarAcao(kv, "1001", "a:e:0");
  assert(extrato.tela.texto.includes("Extrato"), "extrato gerencial não abriu");
  assert(temVoltar(extrato.tela, "a:d:0"), "extrato sem voltar à ficha");
  const inicio = await aplicarAcao(kv, "1001", "a:v");
  assert(inicio.tela.texto.includes("Gerência"), "voltar do extrato não foi ao início");
  assert(opcoesIndividuais(inicio.tela), "início depois do voltar com opções juntas");
  await aplicarAcao(kv, "1001", "a:q");
  const busca = await aplicarTextoAdmin(kv, "1001", conta.numero);
  assert(busca?.tela.texto.includes("Ficha cadastral") === true, "localizar conta não abriu a ficha");
  const livre = await bloquearConta(kv, "77", false);
  assert(livre?.status === "ativa", "liberar depois do painel falhou");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const ana = await aceitarTermos(kv, "77", "Ana");
  const bia = await aceitarTermos(kv, "88", "Bia");
  await aplicarAcao(kv, "1001", "a:d:0");
  await aplicarAcao(kv, "1001", "a:en:0");
  const nome = await aplicarTextoAdmin(kv, "1001", "Ana Souza");
  assert(nome?.aviso === "Cadastro atualizado.", `editar titular: ${nome?.aviso}`);
  assert(nome?.tela.texto.includes("Ana Souza") === true, "ficha sem o novo titular");
  await aplicarAcao(kv, "1001", "a:eg:0");
  const agencia = await aplicarTextoAdmin(kv, "1001", "17");
  assert(agencia?.tela.texto.includes("Agência 0017") === true, "agência não gravou");
  await aplicarAcao(kv, "1001", "a:eu:0");
  const duplicado = await aplicarTextoAdmin(kv, "1001", bia.numero);
  assert((duplicado?.tela.aviso ?? "").includes("já está em uso"), "número duplicado passou");
  await aplicarAcao(kv, "1001", "a:eu:0");
  const numero = await aplicarTextoAdmin(kv, "1001", "87654321");
  assert(numero?.aviso === "Cadastro atualizado.", `editar número: ${numero?.aviso}`);
  assert(numero?.tela.texto.includes("87654321") === true, "ficha sem o novo número");
  const antiga = await buscarContaLinhaBank(kv, ana.numero);
  assert(antiga === undefined, "índice do número antigo ficou ativo");
  const atual = await lerConta(kv, "77");
  assert(atual?.numero === "87654321", "número não persistiu");
  assert(atual?.chaveInterna === "lb87654321@linhabank", "chave padrão não acompanhou o número");
  const porChave = await buscarContaLinhaBank(kv, "lb87654321@linhabank");
  assert(porChave?.chatId === "77", "chave nova não localiza a conta");
  await aplicarAcao(kv, "1001", "a:ef:0");
  const cartaoFinal = await aplicarTextoAdmin(kv, "1001", "4321");
  assert(cartaoFinal?.tela.texto.includes("**** 4321") === true, "final do cartão não gravou");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  await aceitarTermos(kv, "77", "Ana");
  const deposito = await operarConta(kv, "77", "dep-admin", { acao: "depositar", valor: "25,00" });
  assert(deposito.ok === true, "depósito do teste admin falhou");
  const pix = await aplicarAcao(kv, "1001", "a:p");
  assert(pix.tela.texto.includes("PIX"), "tela PIX sem título");
  semIa(pix.tela.texto);
  assert(pix.tela.teclado.flat().some((b) => b.callback_data === "a:x:0"), "PIX sem liquidar");
  assert(pix.tela.teclado.flat().some((b) => b.callback_data === "a:y:0"), "PIX sem cancelar");
  assert(temVoltar(pix.tela, "a:v"), "PIX sem voltar");
  assert(opcoesIndividuais(pix.tela), "PIX com opções juntas");
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
    assert(configAtual().taxaGatewayRecebimentoCentavos === 99, `custo de recebimento ${configAtual().taxaGatewayRecebimentoCentavos}`);
    assert(configAtual().taxaCentavos === 150, "atualizar apagou o adicional");
    assert(configAtual().taxaPercentual === "1,50", "atualizar apagou o adicional percentual");
    assert((atualizado.aviso ?? "").includes("Taxa LinhaBank inalterada"), `aviso atualizar: ${atualizado.aviso}`);
    assert((atualizado.aviso ?? "").includes("recebimento R$ 0,99"), `aviso atualizar sem recebimento: ${atualizado.aviso}`);
    await aplicarAcao(kv, "1001", "a:g");
    const tarifas = await montarTela(kv, "1001");
    assert(tarifas.texto.includes("Enviar para fora"), "ajustes sem o envio");
    assert(tarifas.texto.includes("Receber de fora (depósito)"), "ajustes sem o recebimento");
    assert(tarifas.texto.includes("Custo Asaas (produção): R$ 2,00") || tarifas.texto.includes("R$ 2,00"), "ajustes sem o custo de envio");
    assert(tarifas.texto.includes("R$ 0,99"), "ajustes sem o custo de recebimento");
    assert(tarifas.texto.includes("Taxa LinhaBank: R$ 1,50 + 1,50%"), "ajustes sem a taxa LinhaBank");
    assert(tarifas.texto.includes("o cliente paga R$ 5,00"), "ajustes sem o total de envio");
    assert(tarifas.texto.includes("o QR sai R$ 103,99"), "ajustes sem o QR já com taxa");
    assert(taxaPixExternoCentavos(10_000) === 500, `PIX externo sem soma gateway+adicional: ${taxaPixExternoCentavos(10_000)}`);
    assert(
      taxaPixExternoRecebimentoCentavos(10_000) === 399,
      `recebimento externo sem soma gateway+adicional: ${taxaPixExternoRecebimentoCentavos(10_000)}`,
    );
    await aplicarAcao(kv, "1001", "a:k:f");
    await aplicarTextoAdmin(kv, "1001", "0,50");
    assert(configAtual().taxaCentavos === 50 && configAtual().taxaGatewayCentavos === 200, "taxa não ficou personalizável");
    assert(configAtual().taxaGatewayRecebimentoCentavos === 99, "adicional apagou o custo de recebimento");
    assert(taxaPixExternoCentavos(10_000) === 400, "adicional novo não entrou no PIX externo");
    assert(taxaPixExternoRecebimentoCentavos(10_000) === 299, "adicional novo não entrou no recebimento externo");
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

{
  assert(textoClienteAnuncio("Manutenção no sábado.").startsWith("LINHABANK\nComunicado"), "anúncio sem cabeçalho");
  assert(!/Thialinha/i.test(textoClienteAnuncio("Manutenção no sábado.")), "anúncio com Thialinha");
  const foto = interpretarAtualizacao({
    update_id: 31,
    message: {
      message_id: 12,
      chat: { id: 1001, type: "private" },
      from: { first_name: "Ana", is_bot: false },
      caption: "Promo do mês",
      photo: [
        { file_id: "AgAC-pequena-01", width: 90 },
        { file_id: "AgAC-grande-arquivo", width: 1280 },
      ],
    },
  });
  assert(foto.tipo === "comprovante" && foto.fotoId === "AgAC-grande-arquivo", "foto do anúncio sem file_id");
  assert(foto.tipo === "comprovante" && foto.caption === "Promo do mês", "foto do anúncio sem legenda");
}

{
  const originalFetch = globalThis.fetch;
  const tokenAnterior = process.env.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_TOKEN = "token-anuncio-teste";
  const envios: { metodo: string; chatId: string; text: string; photo?: string; caption?: string }[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const telegramUrl = url.match(/^https:\/\/api\.telegram\.org\/bottoken-anuncio-teste\/(\w+)$/);
    if (telegramUrl === null) throw new Error(`rede bloqueada no teste anúncio: ${new URL(url).host}`);
    const corpo = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, string>) : {};
    envios.push({
      metodo: telegramUrl[1] ?? "",
      chatId: String(corpo.chat_id ?? ""),
      text: String(corpo.text ?? ""),
      photo: typeof corpo.photo === "string" ? corpo.photo : undefined,
      caption: typeof corpo.caption === "string" ? corpo.caption : undefined,
    });
    return new Response(JSON.stringify({ ok: true, result: { message_id: envios.length } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const kv = kvMemoria();
    await gravarConfig(kv, { chatsAdmin: "1001" });
    await aceitarTermos(kv, "77", "Ana");
    await aceitarTermos(kv, "88", "Bia");
    const tela = await aplicarAcao(kv, "1001", "a:n");
    assert(tela.tela.texto.includes("Anúncio"), "aba anúncio não abriu");
    assert(tela.tela.texto.includes("2 conta"), "anúncio sem destinatários");
    assert(temVoltar(tela.tela, "a:v"), "anúncio sem voltar");
    assert(opcoesIndividuais(tela.tela), "anúncio com opções juntas");
    semIa(tela.tela.texto);
    assert(tela.tela.teclado.flat().some((b) => b.callback_data === "a:ns"), "anúncio sem enviar");
    const vazio = await aplicarAcao(kv, "1001", "a:ns");
    assert((vazio.aviso ?? "").includes("texto ou anexe uma imagem"), "envio vazio passou");
    const texto = await aplicarTextoAdmin(kv, "1001", "Manutenção no sábado às 02:00.");
    assert(texto !== undefined && texto.tela.texto.includes("Manutenção no sábado"), "texto do anúncio não gravou");
    const midia = await aplicarMidiaAdmin(kv, "1001", { fotoId: "AgAC-grande-arquivo" });
    assert(midia !== undefined && midia.tela.texto.includes("anexada"), "imagem do anúncio não anexou");
    const confirmar = await aplicarAcao(kv, "1001", "a:ns");
    assert(confirmar.tela.texto.includes("Confirmar envio"), "confirmação do anúncio não abriu");
    assert(temVoltar(confirmar.tela, "a:n"), "confirmação do anúncio sem voltar");
    assert(opcoesIndividuais(confirmar.tela), "confirmação do anúncio com botões juntos");
    semIa(confirmar.tela.texto);
    const enviado = await aplicarAcao(kv, "1001", "a:ny");
    assert((enviado.aviso ?? "").includes("2 entregue"), `envio do anúncio: ${enviado.aviso}`);
    const fotos = envios.filter((item) => item.metodo === "sendPhoto");
    assert(fotos.length === 2, `sendPhoto ${fotos.length}`);
    assert(
      fotos.every((item) => item.photo === "AgAC-grande-arquivo" && (item.caption ?? "").includes("Manutenção no sábado")),
      "foto do anúncio sem o texto",
    );
    assert(
      fotos.some((item) => item.chatId === "77") && fotos.some((item) => item.chatId === "88"),
      "anúncio não foi para todos os clientes",
    );
    assert(!fotos.some((item) => item.chatId === "1001"), "anúncio foi para o operador sem conta");
    assert(fotos.every((item) => !(item.caption ?? "").includes("Thialinha")), "anúncio com prefixo da Thialinha");
    assert(enviado.tela.texto.includes("1 entregue") || enviado.tela.texto.includes("entregue"), "histórico sem o envio");
  } finally {
    globalThis.fetch = originalFetch;
    if (tokenAnterior === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = tokenAnterior;
  }
}

console.log("admin ok");
