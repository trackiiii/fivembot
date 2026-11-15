import { randomBytes, randomInt } from "node:crypto";

import type { HostKvApi, JsonObject, JsonValue } from "@grok/agent-sdk";

import {
  buscarContaLinhaBank,
  classificarChavePix,
  centavosDe,
  lerConta,
  operarConta,
  reaisDe,
  type ResultadoOperacao,
} from "./banco.js";
import { registrarTroca, enviarTexto } from "./atendimento.js";
import { emManutencao, garantirConfig } from "./config.js";
import {
  formatarQuando,
  instanteNoBrasil,
  nomeRepeticao,
  ocorrenciaDevida,
  proximaDepois,
  type Frequencia,
} from "./horario.js";
import {
  RESPOSTA_SEM_CONTA,
  respostaAgendamentoCancelado,
  respostaAgendamentoCriado,
  respostaListaAgendamentos,
  respostaPixAgendadoEnviado,
  respostaPixAgendadoNaoEnviado,
} from "./respostas.js";

const MAX_ATIVOS = 5;
const MAX_HISTORICO = 10;
const MAX_POR_CICLO = 20;
const HORIZONTE_MS = 366 * 24 * 60 * 60 * 1000;
const ESPERA_FALHA_MS = 5 * 60 * 1000;
const EXECUCAO_MS = 90_000;
const TRAVA = "linhabank:agenda:trava";
const INDICE = "linhabank:agenda:indice";

export type ItemAgenda = {
  id: string;
  valor: string;
  destino: string;
  quando: string;
  repeticao: string;
};

export type ResultadoAgenda = {
  ok: boolean;
  motivo?: string;
  texto: string;
  agendamentos: ItemAgenda[];
};

export type ResumoProcessamento = {
  enviados: number;
  mantidos: number;
  encerrados: number;
};

type StatusAgenda = "ativo" | "cancelado" | "concluido" | "encerrado";

type Agendamento = {
  id: string;
  chatId: string;
  valorCentavos: number;
  chavePix: string;
  frequencia: Frequencia;
  hora: number;
  minuto: number;
  diaSemana: number;
  diaMes: number;
  proximaEm: string;
  status: StatusAgenda;
  criadoEm: string;
  tentarDeNovoEm?: string;
  emExecucaoDesde?: string;
  aviso?: string;
  avisoOcorrencia?: string;
};

type QuandoLido =
  | { ok: true; quando: Date; diaSemana: number; diaMes: number; hora: number; minuto: number }
  | { ok: false; motivo: string; texto: string };

export type AvisarAgenda = (chatId: string, texto: string) => Promise<boolean>;

type AvisoPendente = { chatId: string; id: string; texto: string };
type Reivindicado = { agenda: Agendamento; ocorrencia: string };

let cadeia: Promise<unknown> = Promise.resolve();
let emAndamento: Promise<ResumoProcessamento> | undefined;

function chaveLista(chatId: string): string {
  return `linhabank:agenda:chat:${chatId}`;
}

function chaveId(id: string): string {
  return `linhabank:agenda:id:${id}`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => {
    setTimeout(resolver, ms);
  });
}

function emFila<T>(trabalho: () => Promise<T>): Promise<T> {
  const resultado = cadeia.then(trabalho, trabalho);
  cadeia = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
}

function travaExpirou(valor: string, agora: number): boolean {
  const ms = Number(valor.split(":")[0]);
  return !Number.isFinite(ms) || agora - ms > 20_000;
}

async function comTrava<T>(kv: HostKvApi, trabalho: () => Promise<T>): Promise<T> {
  const dono = `${Date.now()}:${randomInt(1_000_000_000)}`;
  for (let tentativa = 0; tentativa < 25; tentativa += 1) {
    const atual = await kv.get(TRAVA);
    const livre = typeof atual !== "string" || travaExpirou(atual, Date.now());
    if (livre) {
      await kv.put(TRAVA, dono);
      if ((await kv.get(TRAVA)) === dono) {
        try {
          return await trabalho();
        } finally {
          if ((await kv.get(TRAVA)) === dono) await kv.delete(TRAVA);
        }
      }
    }
    await esperar(20 + tentativa * 10);
  }
  return trabalho();
}

function exclusivo<T>(kv: HostKvApi, trabalho: () => Promise<T>): Promise<T> {
  return emFila(() => comTrava(kv, trabalho));
}

function comoObjeto(valor: JsonValue | undefined): JsonObject | undefined {
  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  return valor;
}

function frequenciaDe(valor: JsonValue | undefined): Frequencia | undefined {
  if (valor === "uma_vez" || valor === "diaria" || valor === "semanal" || valor === "mensal") return valor;
  return undefined;
}

function statusDe(valor: JsonValue | undefined): StatusAgenda | undefined {
  if (valor === "ativo" || valor === "cancelado" || valor === "concluido" || valor === "encerrado") return valor;
  return undefined;
}

function textoOpcional(valor: JsonValue | undefined): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

function lerAgendamento(valor: JsonValue | undefined): Agendamento | undefined {
  const item = comoObjeto(valor);
  if (item === undefined) return undefined;
  const frequencia = frequenciaDe(item.frequencia);
  const status = statusDe(item.status);
  if (
    frequencia === undefined ||
    status === undefined ||
    typeof item.id !== "string" ||
    typeof item.chatId !== "string" ||
    typeof item.chavePix !== "string" ||
    typeof item.proximaEm !== "string" ||
    typeof item.criadoEm !== "string" ||
    typeof item.valorCentavos !== "number" ||
    typeof item.hora !== "number" ||
    typeof item.minuto !== "number" ||
    typeof item.diaSemana !== "number" ||
    typeof item.diaMes !== "number" ||
    !Number.isSafeInteger(item.valorCentavos)
  ) {
    return undefined;
  }
  if (Number.isNaN(new Date(item.proximaEm).getTime())) return undefined;
  return {
    id: item.id,
    chatId: item.chatId,
    valorCentavos: item.valorCentavos,
    chavePix: item.chavePix,
    frequencia,
    hora: item.hora,
    minuto: item.minuto,
    diaSemana: item.diaSemana,
    diaMes: item.diaMes,
    proximaEm: item.proximaEm,
    status,
    criadoEm: item.criadoEm,
    tentarDeNovoEm: textoOpcional(item.tentarDeNovoEm),
    emExecucaoDesde: textoOpcional(item.emExecucaoDesde),
    aviso: textoOpcional(item.aviso),
    avisoOcorrencia: textoOpcional(item.avisoOcorrencia),
  };
}

function serializar(item: Agendamento): JsonObject {
  const base: JsonObject = {
    id: item.id,
    chatId: item.chatId,
    valorCentavos: item.valorCentavos,
    chavePix: item.chavePix,
    frequencia: item.frequencia,
    hora: item.hora,
    minuto: item.minuto,
    diaSemana: item.diaSemana,
    diaMes: item.diaMes,
    proximaEm: item.proximaEm,
    status: item.status,
    criadoEm: item.criadoEm,
  };
  if (item.tentarDeNovoEm !== undefined) base.tentarDeNovoEm = item.tentarDeNovoEm;
  if (item.emExecucaoDesde !== undefined) base.emExecucaoDesde = item.emExecucaoDesde;
  if (item.aviso !== undefined) base.aviso = item.aviso;
  if (item.avisoOcorrencia !== undefined) base.avisoOcorrencia = item.avisoOcorrencia;
  return base;
}

async function lerLista(kv: HostKvApi, chatId: string): Promise<Agendamento[]> {
  const bruto = await kv.get(chaveLista(chatId));
  if (!Array.isArray(bruto)) return [];
  const lista: Agendamento[] = [];
  for (const item of bruto) {
    const lido = lerAgendamento(item);
    if (lido !== undefined) lista.push(lido);
  }
  return lista;
}

function podar(lista: Agendamento[]): Agendamento[] {
  const ativos = lista.filter((item) => item.status === "ativo");
  const restantes = lista.filter((item) => item.status !== "ativo").slice(-MAX_HISTORICO);
  return [...ativos, ...restantes];
}

async function gravarLista(kv: HostKvApi, chatId: string, lista: Agendamento[]): Promise<void> {
  await kv.put(chaveLista(chatId), podar(lista).map(serializar));
}

async function lerChats(kv: HostKvApi): Promise<string[]> {
  const bruto = comoObjeto(await kv.get(INDICE));
  if (bruto === undefined || !Array.isArray(bruto.chats)) return [];
  const vistos = new Set<string>();
  const chats: string[] = [];
  for (const chat of bruto.chats) {
    if (typeof chat !== "string" || vistos.has(chat)) continue;
    vistos.add(chat);
    chats.push(chat);
  }
  return chats;
}

async function sincronizarIndice(kv: HostKvApi, chatId: string, lista: Agendamento[]): Promise<void> {
  const chats = await lerChats(kv);
  const ativo = lista.some((item) => item.status === "ativo");
  const tem = chats.includes(chatId);
  if (ativo && !tem) chats.push(chatId);
  if (!ativo && tem) {
    const posicao = chats.indexOf(chatId);
    if (posicao >= 0) chats.splice(posicao, 1);
  }
  await kv.put(INDICE, { chats });
}

export function codigoVisivel(id: string): string {
  return `AG-${id.slice(2).toUpperCase()}`;
}

export function canonizarCodigo(bruto: string): string | undefined {
  const limpo = bruto.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const corpo = limpo.startsWith("ag") ? limpo.slice(2) : limpo;
  if (!/^[0-9a-f]{8}$/.test(corpo)) return undefined;
  return `ag${corpo}`;
}

function resumir(item: Agendamento): ItemAgenda {
  return {
    id: codigoVisivel(item.id),
    valor: reaisDe(item.valorCentavos),
    destino: item.chavePix,
    quando: formatarQuando(item.proximaEm),
    repeticao: nomeRepeticao(item.frequencia, item.diaSemana, item.diaMes),
  };
}

function falha(motivo: string, texto: string): ResultadoAgenda {
  return { ok: false, motivo, texto, agendamentos: [] };
}

function lerData(bruta: string): { ano: number; mes: number; dia: number } | undefined {
  const texto = bruta.trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const brasil = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const ano = iso ? Number(iso[1]) : brasil ? Number(brasil[3]) : Number.NaN;
  const mes = iso ? Number(iso[2]) : brasil ? Number(brasil[2]) : Number.NaN;
  const dia = iso ? Number(iso[3]) : brasil ? Number(brasil[1]) : Number.NaN;
  if (!iso && !brasil) return undefined;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 2024 || ano > 2100) return undefined;
  const prova = new Date(Date.UTC(ano, mes - 1, dia));
  if (prova.getUTCFullYear() !== ano || prova.getUTCMonth() !== mes - 1 || prova.getUTCDate() !== dia) return undefined;
  return { ano, mes, dia };
}

function lerHora(bruta: string): { hora: number; minuto: number } | undefined {
  const achado = bruta.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (achado === null) return undefined;
  const hora = Number(achado[1]);
  const minuto = Number(achado[2]);
  if (hora > 23 || minuto > 59) return undefined;
  return { hora, minuto };
}

function interpretarQuando(
  frequencia: Frequencia,
  data: string,
  horaTexto: string,
  agora: Date,
): QuandoLido {
  const dia = lerData(data);
  const hora = lerHora(horaTexto);
  if (dia === undefined || hora === undefined) {
    return {
      ok: false,
      motivo: "horario_invalido",
      texto: "Não entendi a data ou o horário. Informe o dia e a hora, por exemplo 20/11 às 09:00.",
    };
  }
  if (frequencia === "mensal" && dia.dia > 28) {
    return {
      ok: false,
      motivo: "dia_invalido",
      texto: "O PIX mensal usa um dia entre 1 e 28, para caber em todos os meses. Qual dia você prefere?",
    };
  }
  let quando = instanteNoBrasil(dia.ano, dia.mes, dia.dia, hora.hora, hora.minuto);
  if (quando.getTime() <= agora.getTime()) {
    if (frequencia === "uma_vez") {
      return {
        ok: false,
        motivo: "horario_passado",
        texto: "Esse horário já passou. Quer escolher outro?",
      };
    }
    quando = new Date(proximaDepois(frequencia, quando.toISOString(), agora));
  }
  if (quando.getTime() - agora.getTime() > HORIZONTE_MS) {
    return {
      ok: false,
      motivo: "horario_invalido",
      texto: "O primeiro envio precisa ficar dentro de um ano. Quer escolher outra data?",
    };
  }
  return {
    ok: true,
    quando,
    diaSemana: diaDaSemana(quando),
    diaMes: dia.dia,
    hora: hora.hora,
    minuto: hora.minuto,
  };
}

function diaDaSemana(quando: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(quando);
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dias[nome] ?? 0;
}

function execucaoRecente(item: Agendamento, agora: Date): boolean {
  if (item.emExecucaoDesde === undefined) return false;
  const desde = new Date(item.emExecucaoDesde).getTime();
  return Number.isFinite(desde) && agora.getTime() - desde < EXECUCAO_MS;
}

function repetirDepois(item: Agendamento, agora: Date): boolean {
  if (item.tentarDeNovoEm === undefined) return false;
  const quando = new Date(item.tentarDeNovoEm).getTime();
  return Number.isFinite(quando) && quando > agora.getTime();
}

function novoId(lista: Agendamento[]): string {
  const usados = new Set(lista.map((item) => item.id));
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const id = `ag${randomBytes(4).toString("hex")}`;
    if (!usados.has(id)) return id;
  }
  return `ag${randomBytes(4).toString("hex")}`;
}

export async function criarAgendamento(
  kv: HostKvApi,
  chatId: string,
  pedido: { valor?: string; chavePix?: string; frequencia?: string; data?: string; hora?: string },
  agora = new Date(),
): Promise<ResultadoAgenda> {
  if ((await lerConta(kv, chatId)) === undefined) return falha("sem_conta", RESPOSTA_SEM_CONTA);
  const frequencia = frequenciaDe(pedido.frequencia);
  if (frequencia === undefined || pedido.data === undefined || pedido.hora === undefined) {
    return falha("horario_invalido", "Para agendar, preciso do valor, da chave, da frequência e do horário.");
  }
  const centavos = centavosDe(pedido.valor);
  if (centavos === undefined) {
    return falha("valor_invalido", "O valor do PIX agendado precisa ser entre R$ 0,01 e R$ 5.000,00. Qual valor você quer agendar?");
  }
  const bruta = (pedido.chavePix ?? "").trim();
  const contaDestino = await buscarContaLinhaBank(kv, bruta);
  let destino: string;
  if (contaDestino !== undefined) {
    if (contaDestino.chatId === chatId) {
      return falha("mesmo_cliente", "Essa chave é da sua própria conta. Informe a chave de outra conta.");
    }
    destino = contaDestino.chaveInterna;
  } else {
    const classe = classificarChavePix(bruta);
    if (classe === "interna") {
      return falha("destino_invalido", "Não encontrei essa conta LinhaBank. Confira a chave.");
    }
    if (classe !== "externa") {
      return falha(
        "chave_ausente",
        "A chave PIX do destino não está no formato aceito. Pode ser e-mail, celular com +55, CPF, CNPJ, chave aleatória ou chave de conta LinhaBank. Qual é a chave?",
      );
    }
    destino = bruta.toLowerCase();
  }
  const quando = interpretarQuando(frequencia, pedido.data, pedido.hora, agora);
  if (!quando.ok) return falha(quando.motivo, quando.texto);
  return exclusivo(kv, async () => {
    const lista = await lerLista(kv, chatId);
    if (lista.filter((item) => item.status === "ativo").length >= MAX_ATIVOS) {
      return falha(
        "limite",
        "Você já tem o máximo de PIX agendados ativos. Cancele um para criar outro. Quer ver a lista?",
      );
    }
    let id = novoId(lista);
    for (let tentativa = 0; tentativa < 5; tentativa += 1) {
      if ((await kv.get(chaveId(id))) === undefined) break;
      id = novoId(lista);
    }
    const agenda: Agendamento = {
      id,
      chatId,
      valorCentavos: centavos,
      chavePix: destino,
      frequencia,
      hora: quando.hora,
      minuto: quando.minuto,
      diaSemana: quando.diaSemana,
      diaMes: quando.diaMes,
      proximaEm: quando.quando.toISOString(),
      status: "ativo",
      criadoEm: agora.toISOString(),
    };
    lista.push(agenda);
    await kv.put(chaveId(id), chatId);
    await gravarLista(kv, chatId, lista);
    await sincronizarIndice(kv, chatId, lista);
    const item = resumir(agenda);
    return {
      ok: true,
      texto: respostaAgendamentoCriado(item),
      agendamentos: [item],
    };
  });
}

export async function contarAgendamentosAtivos(kv: HostKvApi): Promise<number> {
  const chats = await lerChats(kv);
  let total = 0;
  for (const chatId of chats) {
    total += (await lerLista(kv, chatId)).filter((item) => item.status === "ativo").length;
  }
  return total;
}

export async function listarAgendamentos(kv: HostKvApi, chatId: string): Promise<ResultadoAgenda> {
  if ((await lerConta(kv, chatId)) === undefined) return falha("sem_conta", RESPOSTA_SEM_CONTA);
  const ativos = (await lerLista(kv, chatId))
    .filter((item) => item.status === "ativo")
    .sort((a, b) => a.proximaEm.localeCompare(b.proximaEm))
    .map(resumir);
  return { ok: true, texto: respostaListaAgendamentos(ativos), agendamentos: ativos };
}

export async function cancelarAgendamento(
  kv: HostKvApi,
  chatId: string,
  codigo: string | undefined,
): Promise<ResultadoAgenda> {
  if ((await lerConta(kv, chatId)) === undefined) return falha("sem_conta", RESPOSTA_SEM_CONTA);
  const id = codigo === undefined ? undefined : canonizarCodigo(codigo);
  if (id === undefined) {
    return falha("nao_encontrado", "Não encontrei esse código. Os códigos começam com AG-. Quer ver os PIX agendados?");
  }
  return exclusivo(kv, async () => {
    const lista = await lerLista(kv, chatId);
    const item = lista.find((agenda) => agenda.id === id && agenda.status === "ativo");
    if (item === undefined) {
      return falha("nao_encontrado", "Não encontrei esse agendamento ativo. Quer ver os PIX agendados?");
    }
    item.status = "cancelado";
    item.emExecucaoDesde = undefined;
    item.tentarDeNovoEm = undefined;
    await gravarLista(kv, chatId, lista);
    await sincronizarIndice(kv, chatId, lista);
    const resumo = resumir(item);
    return { ok: true, texto: respostaAgendamentoCancelado(resumo), agendamentos: [resumo] };
  });
}

function decidirDepois(agenda: Agendamento, agora: Date, resultado: ResultadoOperacao, ocorrencia: string): Agendamento {
  const base: Agendamento = {
    ...agenda,
    emExecucaoDesde: undefined,
    tentarDeNovoEm: undefined,
  };
  const valor = reaisDe(agenda.valorCentavos);
  if (resultado.ok) {
    const proximo = agenda.frequencia === "uma_vez" ? undefined : formatarQuando(proximaDepois(agenda.frequencia, ocorrencia, agora));
    return {
      ...base,
      status: agenda.frequencia === "uma_vez" ? "concluido" : "ativo",
      proximaEm: agenda.frequencia === "uma_vez" ? agenda.proximaEm : proximaDepois(agenda.frequencia, ocorrencia, agora),
      aviso: respostaPixAgendadoEnviado({
        valor,
        destino: resultado.interno ? `conta LinhaBank ${resultado.destino ?? agenda.chavePix}` : agenda.chavePix,
        saldo: resultado.saldo ?? reaisDe(0),
        comprovante: resultado.endToEndId?.slice(0, 40),
        proximo,
        taxa: resultado.taxa,
        interno: resultado.interno,
      }),
      avisoOcorrencia: undefined,
    };
  }
  const temporario = resultado.motivo === "gateway_pendente" || resultado.motivo === "gateway_indisponivel";
  if (temporario) {
    const repetido = agenda.avisoOcorrencia === ocorrencia;
    return {
      ...base,
      status: "ativo",
      tentarDeNovoEm: new Date(agora.getTime() + ESPERA_FALHA_MS).toISOString(),
      aviso: repetido
        ? agenda.aviso
        : respostaPixAgendadoNaoEnviado({ valor, destino: agenda.chavePix }),
      avisoOcorrencia: ocorrencia,
    };
  }
  if (agenda.frequencia === "uma_vez") {
    return {
      ...base,
      status: "encerrado",
      aviso: respostaPixAgendadoNaoEnviado({ valor, destino: agenda.chavePix, encerrado: true }),
      avisoOcorrencia: undefined,
    };
  }
  const seguinte = proximaDepois(agenda.frequencia, ocorrencia, agora);
  return {
    ...base,
    status: "ativo",
    proximaEm: seguinte,
    aviso: respostaPixAgendadoNaoEnviado({
      valor,
      destino: agenda.chavePix,
      proximo: formatarQuando(seguinte),
    }),
    avisoOcorrencia: undefined,
  };
}

async function coletarAvisos(kv: HostKvApi): Promise<AvisoPendente[]> {
  const pendentes: AvisoPendente[] = [];
  for (const chatId of await lerChats(kv)) {
    const lista = await lerLista(kv, chatId);
    let mudou = false;
    for (const item of lista) {
      if (item.aviso === undefined) continue;
      pendentes.push({ chatId, id: item.id, texto: item.aviso });
      item.aviso = undefined;
      mudou = true;
    }
    if (mudou) await gravarLista(kv, chatId, lista);
  }
  return pendentes;
}

async function restaurarAviso(kv: HostKvApi, aviso: AvisoPendente): Promise<void> {
  const lista = await lerLista(kv, aviso.chatId);
  const item = lista.find((agenda) => agenda.id === aviso.id);
  if (item === undefined || item.aviso !== undefined) return;
  item.aviso = aviso.texto;
  await gravarLista(kv, aviso.chatId, lista);
}

async function reivindicar(kv: HostKvApi, agora: Date): Promise<Reivindicado[]> {
  const saida: Reivindicado[] = [];
  for (const chatId of await lerChats(kv)) {
    if (saida.length >= MAX_POR_CICLO) break;
    const lista = await lerLista(kv, chatId);
    let mudou = false;
    for (const item of lista) {
      if (saida.length >= MAX_POR_CICLO) break;
      if (item.status !== "ativo" || execucaoRecente(item, agora) || repetirDepois(item, agora)) continue;
      const ocorrencia = ocorrenciaDevida(item.frequencia, item.proximaEm, agora);
      if (ocorrencia === undefined) continue;
      item.emExecucaoDesde = agora.toISOString();
      mudou = true;
      saida.push({ agenda: { ...item }, ocorrencia });
    }
    if (mudou) await gravarLista(kv, chatId, lista);
  }
  return saida;
}

async function aplicar(
  kv: HostKvApi,
  reivindicado: Reivindicado,
  agora: Date,
  resultado: ResultadoOperacao,
): Promise<Agendamento | undefined> {
  const lista = await lerLista(kv, reivindicado.agenda.chatId);
  const item = lista.find((agenda) => agenda.id === reivindicado.agenda.id);
  if (item === undefined) return undefined;
  const valor = reaisDe(item.valorCentavos);
  if (item.status === "cancelado") {
    item.emExecucaoDesde = undefined;
    item.tentarDeNovoEm = undefined;
    if (resultado.ok) {
      item.aviso = respostaPixAgendadoEnviado({
        valor,
        destino: resultado.interno ? `conta LinhaBank ${resultado.destino ?? item.chavePix}` : item.chavePix,
        saldo: resultado.saldo ?? reaisDe(0),
        comprovante: resultado.endToEndId?.slice(0, 40),
        aposCancelamento: true,
        taxa: resultado.taxa,
        interno: resultado.interno,
      });
    }
  } else {
    const seguinte = decidirDepois(item, agora, resultado, reivindicado.ocorrencia);
    Object.assign(item, seguinte);
  }
  await gravarLista(kv, item.chatId, lista);
  await sincronizarIndice(kv, item.chatId, lista);
  return item;
}

async function soltar(kv: HostKvApi, reivindicado: Reivindicado): Promise<void> {
  const lista = await lerLista(kv, reivindicado.agenda.chatId);
  const item = lista.find((agenda) => agenda.id === reivindicado.agenda.id);
  if (item === undefined) return;
  item.emExecucaoDesde = undefined;
  await gravarLista(kv, item.chatId, lista);
}

async function entregar(kv: HostKvApi, avisos: AvisoPendente[], avisar: AvisarAgenda): Promise<void> {
  for (const aviso of avisos) {
    let ok = false;
    try {
      ok = await avisar(aviso.chatId, aviso.texto);
    } catch {
      ok = false;
    }
    if (ok) await exclusivo(kv, () => limparAvisoIgual(kv, aviso));
    else await exclusivo(kv, () => restaurarAviso(kv, aviso));
  }
}

async function limparAvisoIgual(kv: HostKvApi, aviso: AvisoPendente): Promise<void> {
  const lista = await lerLista(kv, aviso.chatId);
  const item = lista.find((agenda) => agenda.id === aviso.id);
  if (item === undefined || item.aviso !== aviso.texto) return;
  item.aviso = undefined;
  await gravarLista(kv, aviso.chatId, lista);
}

async function avisarPadrao(kv: HostKvApi, chatId: string, texto: string): Promise<boolean> {
  const enviado = await enviarTexto(chatId, texto);
  if (!enviado) return false;
  const conta = await lerConta(kv, chatId);
  await registrarTroca(kv, chatId, conta?.nome ?? "cliente", "PIX agendado", texto, "agenda");
  return true;
}

async function executarCiclo(
  kv: HostKvApi,
  agora: Date,
  avisar: AvisarAgenda,
): Promise<ResumoProcessamento> {
  await garantirConfig(kv);
  const pendentes = await exclusivo(kv, () => coletarAvisos(kv));
  await entregar(kv, pendentes, avisar);
  if (emManutencao()) return { enviados: 0, mantidos: 0, encerrados: 0 };
  const devidos = await exclusivo(kv, () => reivindicar(kv, agora));
  let enviados = 0;
  let mantidos = 0;
  let encerrados = 0;
  for (const item of devidos) {
    const confirmado = (await lerLista(kv, item.agenda.chatId)).find((agenda) => agenda.id === item.agenda.id);
    if (confirmado === undefined || confirmado.status !== "ativo") {
      await exclusivo(kv, () => soltar(kv, item));
      continue;
    }
    let resultado: ResultadoOperacao;
    try {
      resultado = await operarConta(kv, item.agenda.chatId, `agenda:${item.agenda.id}:${item.ocorrencia}`, {
        acao: "enviar_pix",
        valor: reaisDe(item.agenda.valorCentavos),
        chavePix: item.agenda.chavePix,
        origem: "agendado",
      });
      const aviso = resultado.avisoDestino;
      if (aviso !== undefined) {
        const enviado = await enviarTexto(aviso.chatId, aviso.texto);
        if (enviado) await registrarTroca(kv, aviso.chatId, "cliente", "PIX recebido", aviso.texto, "agenda");
      }
    } catch {
      await exclusivo(kv, () => soltar(kv, item));
      continue;
    }
    const atual = await exclusivo(kv, () => aplicar(kv, item, agora, resultado));
    if (resultado.ok) enviados += 1;
    else if (atual?.status === "encerrado") encerrados += 1;
    else mantidos += 1;
    if (atual?.aviso !== undefined) {
      await entregar(kv, [{ chatId: atual.chatId, id: atual.id, texto: atual.aviso }], avisar);
    }
  }
  return { enviados, mantidos, encerrados };
}

export function processarAgendamentos(
  kv: HostKvApi,
  agora = new Date(),
  avisar?: AvisarAgenda,
): Promise<ResumoProcessamento> {
  if (emAndamento !== undefined) return emAndamento;
  const avisarFinal = avisar ?? ((chatId, texto) => avisarPadrao(kv, chatId, texto));
  emAndamento = executarCiclo(kv, agora, avisarFinal).finally(() => {
    emAndamento = undefined;
  });
  return emAndamento;
}

export function comandoAgendamentos(texto: string): boolean {
  const limpo = texto.trim().toLowerCase();
  return limpo === "/agendamentos" || limpo.startsWith("/agendamentos@") || limpo.startsWith("/agendamentos ");
}
