import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

process.env.LINHABANK_SILENCIO_CANAL = "1";
process.env.TELEGRAM_BOT_USERNAME = "linhabank_bot";
process.env.ADMIN_TOKEN = "token-admin-teste";
delete process.env.LINHABANK_SQL;
delete process.env.DATABASE_URL;
delete process.env.LINHABANK_DB_PATH;

const { aceitarTermos } = await import("../bot/lib/banco.js");
const { classificarTexto, responderLocal } = await import("../bot/lib/conversa/index.js");
const { garantirConfig, gravarConfig } = await import("../bot/lib/config.js");
const { ehAdmin } = await import("../bot/lib/modo.js");
const { aplicarAcao, aplicarTextoAdmin, parseAcao, tentarAbrirAdmin } = await import("../bot/lib/admin/painel.js");
const { parseAcaoClube, montarClube } = await import("../bot/lib/clube/painel.js");
const {
  aplicarLbcoins,
  ajustarLbcoinsAdmin,
  ajustarXpAdmin,
  aoAbrirContaFidelidade,
  bloquearRecompensas,
  capturarStartIndicacao,
  categoriaDeXp,
  consultarClube,
  decidirIndicacao,
  garantirFidelidade,
  historicoLbcoins,
  historicoRecompensas,
  listarPendentes,
  payloadStart,
  vincularIndicacao,
} = await import("../bot/lib/fidelidade/index.js");
const { novoCodigoIndicacao, codigoIndicacaoValido } = await import("../bot/lib/fidelidade/ids.js");

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

assert(codigoIndicacaoValido("LBABCDEF"), "formato do código");
assert(!codigoIndicacaoValido("LBI00000"), "I e 0 não entram no alfabeto");
assert(payloadStart("/start LBABCD2") === "LBABCD2", "payload /start");
assert(payloadStart("/start") === undefined, "/start sem código");
assert(parseAcaoClube("c:s") === "saldo", "callback Club saldo");
assert(parseAcao("a:h")?.tipo === "aba", "aba Clube");
assert(parseAcao("a:ic:m")?.tipo === "criterio", "critério manual");
assert(parseAcao("a:ia:0")?.tipo === "aprovar_indicacao", "aprovar indicação");
assert(parseAcao("a:ir:1")?.tipo === "rejeitar_indicacao", "recusar indicação");
assert((parseAcao("a:lb:0") as { campo?: string }).campo === "lbcoinsAjuste", "ajuste LBcoins");
assert(categoriaDeXp(0) === "bronze" && categoriaDeXp(999) === "bronze", "faixa bronze");
assert(categoriaDeXp(1000) === "prata" && categoriaDeXp(4999) === "prata", "faixa prata");
assert(categoriaDeXp(5000) === "ouro", "faixa ouro");

{
  const vistos = new Set<string>();
  for (let i = 0; i < 80; i += 1) {
    const codigo = novoCodigoIndicacao();
    assert(codigoIndicacaoValido(codigo), `código inválido ${codigo}`);
    vistos.add(codigo);
  }
  assert(vistos.size === 80, "códigos de amostra colidiram");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "10", "Ana");
  await aceitarTermos(kv, "11", "Bia");
  const a = await garantirFidelidade(kv, "10");
  const b = await garantirFidelidade(kv, "11");
  if (a === undefined || b === undefined) throw new Error("carteira não nasceu");
  assert(a.carteira.codigoIndicacao !== b.carteira.codigoIndicacao, "código repetido entre contas");
  assert(a.carteira.saldo === 0 && a.xp.categoria === "bronze", "carteira inicial");

  const auto = await vincularIndicacao(kv, "10", a.carteira.codigoIndicacao);
  assert(!auto.ok && auto.motivo === "autoindicacao", "autorreferência passou");

  const ok = await vincularIndicacao(kv, "11", a.carteira.codigoIndicacao);
  if (!ok.ok) throw new Error("indicação válida falhou");
  const dup = await vincularIndicacao(kv, "11", a.carteira.codigoIndicacao);
  assert(!dup.ok && dup.motivo === "ja_indicado", "indicação duplicada passou");

  await aceitarTermos(kv, "12", "Caio");
  await garantirFidelidade(kv, "12");
  const outra = await vincularIndicacao(kv, "11", (await garantirFidelidade(kv, "12"))!.carteira.codigoIndicacao);
  assert(!outra.ok && outra.motivo === "ja_indicado", "trocou o indicador");

  const clubeAntes = await consultarClube(kv, "10");
  if (clubeAntes === undefined) throw new Error("consulta vazia");
  assert(clubeAntes.pendentes === 1 && clubeAntes.aprovadas === 0, "pendente não registrou");
  assert(clubeAntes.saldo === 0, "creditou só por vincular");

  const recusa = await decidirIndicacao(kv, ok.indicacao.id, "rejeitada", "1001", "teste recusa");
  assert(recusa.ok, "recusa falhou");
  const clubeRecusa = await consultarClube(kv, "10");
  assert(clubeRecusa?.saldo === 0 && clubeRecusa.rejeitadas === 1, "recusa creditou");
  const deNovo = await decidirIndicacao(kv, ok.indicacao.id, "aprovada", "1001", "depois da recusa");
  assert(!deNovo.ok && deNovo.motivo === "ja_decidida", "reabriu indicação recusada");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "20", "Duda");
  await aceitarTermos(kv, "21", "Eva");
  const indicador = await garantirFidelidade(kv, "20");
  await garantirFidelidade(kv, "21");
  const vinculo = await vincularIndicacao(kv, "21", indicador!.carteira.codigoIndicacao);
  if (!vinculo.ok) throw new Error("vínculo para crédito");
  const aprovada = await decidirIndicacao(kv, vinculo.indicacao.id, "aprovada", "1001", "ok");
  assert(aprovada.ok, "aprovação falhou");
  const clube = await consultarClube(kv, "20");
  if (clube === undefined) throw new Error("consulta após crédito");
  assert(clube.saldo === 500, `crédito ${clube.saldo}`);
  assert(clube.aprovadas === 1 && clube.ganhoIndicacao === 500, "ganho de indicação");
  assert(clube.xp === 100, `XP da indicação ${clube.xp}`);
  const repetida = await decidirIndicacao(kv, vinculo.indicacao.id, "aprovada", "1001", "dup");
  assert(!repetida.ok && repetida.motivo === "ja_decidida", "aprovou duas vezes");
  const depois = await consultarClube(kv, "20");
  assert(depois?.saldo === 500, "recompensa duplicada");
  const hist = await historicoRecompensas(kv, "20");
  assert(hist.some((item) => item.tipo === "indicacao" && item.quantidade === 500), "histórico sem indicação");
  const ledger = await historicoLbcoins(kv, "20");
  assert(ledger.length === 1, "ledger com lançamento extra");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "30", "Fábio");
  const base = await garantirFidelidade(kv, "30");
  await capturarStartIndicacao(kv, "31", base!.carteira.codigoIndicacao);
  await aceitarTermos(kv, "31", "Gabi");
  const aberto = await aoAbrirContaFidelidade(kv, "31");
  assert(aberto.avisoIndicador === undefined, "creditou no /start");
  const pendentes = await listarPendentes(kv);
  assert(pendentes.length === 1, "deep link não gerou pendente");
  await capturarStartIndicacao(kv, "31", base!.carteira.codigoIndicacao);
  const deNovo = await aoAbrirContaFidelidade(kv, "31");
  assert(deNovo.avisoIndicador === undefined, "relinkou conta existente");
  assert((await listarPendentes(kv)).length === 1, "segunda origem");
}

{
  const kv = kvMemoria();
  await gravarConfig(kv, { indicacaoCriterio: "conta_aberta" });
  await aceitarTermos(kv, "40", "Helô");
  const indicador = await garantirFidelidade(kv, "40");
  await capturarStartIndicacao(kv, "41", indicador!.carteira.codigoIndicacao);
  await aceitarTermos(kv, "41", "Ivo");
  const aberto = await aoAbrirContaFidelidade(kv, "41");
  assert(aberto.avisoIndicador?.chatId === "40", "critério conta aberta não avisou");
  assert((await consultarClube(kv, "40"))?.saldo === 500, "critério conta aberta não creditou");
  await gravarConfig(kv, { indicacaoCriterio: "manual" });
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "50", "Júlia");
  await garantirFidelidade(kv, "50");
  const prata = await ajustarXpAdmin(kv, "1001", "50", 1000, "teste prata");
  assert(prata.ok && prata.xp?.categoria === "prata" && prata.subiu?.para === "prata", "não subiu para Prata");
  const ouro = await ajustarXpAdmin(kv, "1001", "50", 4000, "teste ouro");
  assert(ouro.ok && ouro.xp?.categoria === "ouro" && ouro.subiu?.para === "ouro", "não subiu para Ouro");
  const clube = await consultarClube(kv, "50");
  assert(clube?.categoria === "ouro" && clube.xp === 5000, "consulta XP");
  const semMudanca = await ajustarXpAdmin(kv, "1001", "50", 10, "já ouro");
  assert(semMudanca.subiu === undefined, "notificou subida repetida");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "60", "Kaio");
  await garantirFidelidade(kv, "60");
  const credito = await aplicarLbcoins(kv, {
    chatId: "60",
    tipo: "recompensa",
    quantidade: 80,
    descricao: "campanha teste",
    origem: "teste",
    idempotencyKey: "idem-80",
  });
  assert(credito.ok && credito.carteira.saldo === 80, "crédito simples");
  const repetido = await aplicarLbcoins(kv, {
    chatId: "60",
    tipo: "recompensa",
    quantidade: 80,
    descricao: "campanha teste",
    origem: "teste",
    idempotencyKey: "idem-80",
  });
  assert(repetido.ok && repetido.repetido === true && repetido.carteira.saldo === 80, "idempotência falhou");
  const negativo = await aplicarLbcoins(kv, {
    chatId: "60",
    tipo: "resgate",
    quantidade: -200,
    descricao: "resgate",
    origem: "teste",
    idempotencyKey: "idem-neg",
  });
  assert(!negativo.ok && negativo.motivo === "saldo_insuficiente", "permitiu saldo negativo");
  await bloquearRecompensas(kv, "1001", "60", true, "suspeita");
  const bloqueado = await aplicarLbcoins(kv, {
    chatId: "60",
    tipo: "bonus",
    quantidade: 10,
    descricao: "depois do bloqueio",
    origem: "teste",
    idempotencyKey: "idem-bloq",
  });
  assert(!bloqueado.ok && bloqueado.motivo === "bloqueado", "recompensa saiu com bloqueio");
  const admin = await ajustarLbcoinsAdmin(kv, "1001", "60", 15, "ajuste justificado");
  assert(admin.ok && admin.carteira.saldo === 95, "admin não passou no bloqueio");
}

{
  const kv = kvMemoria();
  await aceitarTermos(kv, "70", "Lia");
  await garantirFidelidade(kv, "70");
  const tela = await montarClube(kv, "70", "home");
  if (tela === undefined) throw new Error("home Club");
  assert(tela.texto.includes("LINHABANK CLUB") === true, "home Club");
  assert(tela.texto.toLowerCase().includes("não são"), "aviso LBcoins");
  const indicar = await montarClube(kv, "70", "indicar");
  if (indicar === undefined) throw new Error("indicar Club");
  assert(indicar.texto.includes("t.me/linhabank_bot?start=") === true, "link de convite");
  assert(indicar.teclado.flat().every((b) => b.callback_data.startsWith("c:")), "teclado Club fora de c:");
}

{
  assert(classificarTexto("quantos lbcoins eu tenho?").categoria === "clube", "classificar saldo LBcoins");
  assert(classificarTexto("qual é minha categoria?").categoria === "clube", "classificar categoria");
  assert(classificarTexto("quantas pessoas eu já indiquei?").categoria === "clube", "classificar indicações");
  assert(classificarTexto("qual é o meu saldo?").categoria === "saldo", "saldo em real foi para o Club");
  const kv = kvMemoria();
  await aceitarTermos(kv, "80", "Mari");
  await garantirFidelidade(kv, "80");
  await aplicarLbcoins(kv, {
    chatId: "80",
    tipo: "bonus",
    quantidade: 42,
    descricao: "teste fala",
    origem: "teste",
    idempotencyKey: "fala-42",
  });
  const local = await responderLocal(kv, "80", "quantos lbcoins eu tenho?", "Mari", true, false, "clu1");
  assert(local.tipo === "texto" && local.categoria === "clube", "Thialinha não consultou o Club");
  if (local.tipo !== "texto") throw new Error("Thialinha não consultou o Club");
  assert(local.texto.includes("42"), "fala sem o saldo real");
  assert(!/t\.me\//.test(local.texto), "saldo de LBcoins misturou o convite");
  assert(!/categoria|XP/i.test(local.texto), "saldo de LBcoins misturou categoria");
  const semConta = await responderLocal(kv, "81", "quantos lbcoins eu tenho?", "Nico", false, false, "clu2");
  assert(semConta.tipo === "texto" && semConta.categoria === "cadastro", "Club sem conta");
  if (semConta.tipo !== "texto") throw new Error("Club sem conta");
  assert(!/R\$\s*\d/.test(semConta.texto), "inventou dinheiro sem conta");
}

{
  const kv = kvMemoria();
  await garantirConfig(kv);
  await gravarConfig(kv, { chatsAdmin: "1001" });
  assert(ehAdmin("1001"), "1001 deveria ser admin");
  assert((await tentarAbrirAdmin(kv, "9")) === "pedir_token", "cliente abriu gerência");
  assert(!ehAdmin("9"), "cliente virou admin");
  await aceitarTermos(kv, "90", "Olga");
  await aceitarTermos(kv, "91", "Paulo");
  const indicador = await garantirFidelidade(kv, "90");
  await garantirFidelidade(kv, "91");
  await vincularIndicacao(kv, "91", indicador!.carteira.codigoIndicacao);
  const clube = await aplicarAcao(kv, "1001", "a:h");
  assert(clube.tela.texto.includes("Clube"), "painel Clube");
  assert(!/Thialinha|Oii|Perfeitooo/i.test(clube.tela.texto), "painel Club informal");
  const aprov = await aplicarAcao(kv, "1001", "a:ia:0");
  assert(aprov.aviso === "Indicação aprovada.", `aprovar no painel: ${aprov.aviso}`);
  assert((await consultarClube(kv, "90"))?.saldo === 500, "painel não creditou");
  const ficha = await aplicarAcao(kv, "1001", "a:d:0");
  assert(ficha.tela.texto.includes("CLUBE"), "ficha sem Club");
  await aplicarAcao(kv, "1001", "a:lb:0");
  const ajuste = await aplicarTextoAdmin(kv, "1001", "25 bônus de campanha extra");
  assert(ajuste?.aviso?.includes("LBcoins ajustados") === true, "ajuste admin");
  assert((await consultarClube(kv, "90"))?.saldo === 525, "ajuste não entrou");
}

{
  process.env.LINHABANK_SQL = "memoria";
  const kv = kvMemoria();
  await aceitarTermos(kv, "sql-1", "Rita");
  await aceitarTermos(kv, "sql-2", "Sara");
  const indicador = await garantirFidelidade(kv, "sql-1");
  await garantirFidelidade(kv, "sql-2");
  const vinculo = await vincularIndicacao(kv, "sql-2", indicador!.carteira.codigoIndicacao);
  if (!vinculo.ok) throw new Error("SQL vínculo");
  const aprovada = await decidirIndicacao(kv, vinculo.indicacao.id, "aprovada", "1001", "sql");
  assert(aprovada.ok, "SQL aprovação");
  const clube = await consultarClube(kv, "sql-1");
  assert(clube?.saldo === 500 && clube.aprovadas === 1, "SQL crédito");
  const idem = await aplicarLbcoins(kv, {
    chatId: "sql-1",
    tipo: "bonus",
    quantidade: 7,
    descricao: "sql",
    origem: "teste",
    idempotencyKey: "sql-7",
  });
  const idem2 = await aplicarLbcoins(kv, {
    chatId: "sql-1",
    tipo: "bonus",
    quantidade: 7,
    descricao: "sql",
    origem: "teste",
    idempotencyKey: "sql-7",
  });
  assert(idem.ok && idem2.ok && idem2.repetido && idem2.carteira.saldo === 507, "SQL idempotência");
  delete process.env.LINHABANK_SQL;
}

console.log("clube ok");
