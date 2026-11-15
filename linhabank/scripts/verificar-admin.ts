import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

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

{
  assert(lerComandoAdmin("/admin") !== undefined, "/admin não reconhecido");
  assert(lerComandoAdmin("/admin@linhabank_bot token-admin-teste")?.token === "token-admin-teste", "token do /admin");
  assert(lerComandoAdmin("saldo") === undefined, "saldo não é /admin");
  assert(parseAcao("a:g")?.tipo === "aba", "botão Config");
  assert(parseAcao("a:k:f")?.tipo === "pedir", "botão taxa");
  assert(parseAcao("a:b:0")?.tipo === "bloquear", "botão bloquear");
  assert((parseAcao("a:x:2") as { indice?: number }).indice === 2, "índice confirmar PIX");
  const todos = ["a:v", "a:c", "a:p", "a:l", "a:g", "a:ms", "a:ml", "a:my", "a:z", "a:r", "a:t:p", "a:t:b"];
  for (const dados of todos) {
    assert(parseAcao(dados) !== undefined, `callback ${dados}`);
    assert(dados.length <= 64, `callback longo ${dados}`);
  }
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
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
  assert(visao.texto.includes("LINHABANK · Administração"), "painel sem título");
  assert(visao.texto.includes("Sem a Thialinha"), "painel sem aviso de botões");
  assert(!/Oii|Perfeitooo|Thialinha:/.test(visao.texto), "painel com diálogo da Thialinha");
  const dados = botoes(visao);
  assert(dados.includes("a:g") && dados.includes("a:ms"), "visão sem botões de config/modo");
  assert(dados.every((item) => item.startsWith("a:") && item.length <= 64), "callback fora do padrão");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  const live = await aplicarAcao(kv, "1001", "a:ml");
  assert(live.tela.teclado.flat().some((b) => b.callback_data === "a:my"), "live sem confirmar");
  assert(modoCarteira() === "sandbox", "live mudou sem confirmar");
  const ok = await aplicarAcao(kv, "1001", "a:my");
  assert(modoCarteira() === "live", "confirmar live falhou");
  const sandbox = await aplicarAcao(kv, "1001", "a:ms");
  assert(modoCarteira() === "sandbox" && (sandbox.aviso ?? "").includes("sandbox"), "voltar sandbox falhou");
  void ok;
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  assert(taxaPixExternoCentavos(10_000) === 0, "taxa inicial não é zero");
  await aplicarAcao(kv, "1001", "a:k:f");
  const salvo = await aplicarTextoAdmin(kv, "1001", "150");
  assert(salvo !== undefined && configAtual().taxaCentavos === 150, "taxa pelo botão não gravou");
  await aplicarAcao(kv, "1001", "a:k:e");
  await aplicarTextoAdmin(kv, "1001", "1,50");
  assert(taxaPixExternoCentavos(10_000) === 300, `taxa do painel deu ${taxaPixExternoCentavos(10_000)}`);
  await aplicarAcao(kv, "1001", "a:k:h");
  await aplicarTextoAdmin(kv, "1001", "admin@linhabank.test");
  assert(configAtual().chaveRecebimento === "admin@linhabank.test", "chave não veio do painel");
  const prefixo = await aplicarAcao(kv, "1001", "a:t:p");
  assert(configAtual().prefixoThialinha === false, "prefixo não desligou");
  assert(prefixo.tela.texto.includes("Configuração"), "depois do toggle não voltou à config");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { chatsAdmin: "1001" });
  await aceitarTermos(kv, "77", "Ana");
  const lista = await aplicarAcao(kv, "1001", "a:c");
  assert(lista.tela.texto.includes("Ana"), "contas sem a titular");
  assert(lista.tela.teclado.flat().some((b) => b.callback_data === "a:b:0"), "contas sem bloquear");
  const bloqueada = await aplicarAcao(kv, "1001", "a:b:0");
  assert((bloqueada.aviso ?? "").includes("bloqueada"), "bloquear pelo botão falhou");
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
  assert(pix.tela.teclado.flat().some((b) => b.callback_data === "a:x:0"), "PIX sem confirmar");
  const pago = await aplicarAcao(kv, "1001", "a:x:0");
  assert(pago.aviso === "PIX confirmado.", `sandbox pagar: ${pago.aviso}`);
  assert(pago.avisoCliente?.chatId === "77", "cliente não foi avisado");
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
  const kv = kvMemoria();
  await garantirConfig(kv);
  assert(modoCarteira() === "sandbox", "kv vazio não voltou ao padrão");
}

console.log("admin ok");
