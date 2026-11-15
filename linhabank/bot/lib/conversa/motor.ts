import type { HostKvApi } from "@grok/agent-sdk";

import { listarCobrancas } from "../store-kv.js";
import { sqlDisponivel } from "../db.js";
import { listarCobrancasSql } from "../store-sql.js";
import { operarConta, reaisDe } from "../banco.js";
import { consultarClube, rotuloCategoria } from "../fidelidade/index.js";
import { configAtual } from "../config.js";
import { FALAS_DEPOSITO_GERADO, falasDa } from "./biblioteca/index.js";
import { classificarTexto, extrairValorDeposito } from "./classificar.js";
import { escolherFala, preencher, primeiroNome, registrarUso } from "./escolher.js";
import { gravarEstadoFala, lerEstadoFala } from "./estado.js";
import type { Categoria, ResultadoLocal, Slots } from "./tipos.js";

const LEITURA: Categoria[] = ["saldo", "extratos", "pendentes", "confirmados"];
const PRECISA_CONTA: Categoria[] = [...LEITURA, "depositos", "transferencias", "clube"];

export async function responderLocal(
  kv: HostKvApi,
  chatId: string,
  texto: string,
  nome: string,
  temConta: boolean,
  historicoVazio: boolean,
  idOperacao: string,
): Promise<ResultadoLocal> {
  const estado = await lerEstadoFala(kv, chatId);
  const intencao = classificarTexto(texto, estado.pendente);
  if (intencao.categoria === "modelo") return { tipo: "modelo" };
  if (intencao.confianca < 0.55 && intencao.categoria !== "incompreensao") return { tipo: "modelo" };

  let categoria = intencao.categoria;
  if (historicoVazio && categoria === "saudacoes") categoria = "apresentacao";
  if (!temConta && PRECISA_CONTA.includes(categoria)) categoria = "cadastro";

  const slots: Slots = { nome: primeiroNome(nome) ?? nome };
  let proximo = estado.pendente;
  let valorDeposito: string | undefined;

  if (categoria === "depositos") {
    valorDeposito = extrairValorDeposito(texto);
    if (valorDeposito === undefined) {
      proximo = "valor_deposito";
    } else if (temConta) {
      const gerado = await operarConta(kv, chatId, idOperacao, { acao: "depositar", valor: valorDeposito });
      if (!gerado.ok || gerado.copiaECola === undefined || gerado.valor === undefined) {
        categoria = gerado.motivo === "sem_conta" ? "cadastro" : "tecnico";
      } else {
        slots.valor = gerado.valor;
        slots.taxa =
          gerado.taxa !== undefined && gerado.taxa !== "0,00"
            ? ` Taxa R$ ${gerado.taxa} já inclusa. Entram R$ ${gerado.liquido ?? gerado.valor} na conta.`
            : " O saldo só entra depois da confirmação.";
        slots.destino = gerado.copiaECola;
        const fala = escolherFala(FALAS_DEPOSITO_GERADO, estado, slots);
        const textoFinal = preencher(fala.texto, slots);
        const novo = registrarUso({ ...estado, pendente: undefined }, "depositos", fala.id);
        await gravarEstadoFala(kv, chatId, novo);
        return {
          tipo: "deposito",
          texto: textoFinal,
          categoria: "depositos",
          falaId: fala.id,
          valor: gerado.valor,
          copiaECola: gerado.copiaECola,
        };
      }
    }
  } else {
    proximo = undefined;
  }

  if (LEITURA.includes(categoria) && temConta) {
    const financeiro = await preencherFinanceiro(kv, chatId, idOperacao, categoria, slots);
    if (!financeiro.ok) categoria = "tecnico";
  }
  if (falaPrecisaClube(categoria) && temConta) {
    const clube = await consultarClube(kv, chatId);
    if (clube === undefined) categoria = "cadastro";
    else preencherClube(slots, clube);
  }

  const fala = escolherFala(falasDa(categoria), estado, slots);
  if (fala.texto.includes("{saldo}") && slots.saldo === undefined) return { tipo: "modelo" };
  if (fala.texto.includes("{lbcoins}") && slots.lbcoins === undefined) return { tipo: "modelo" };
  const textoFinal = preencher(fala.texto, slots);
  const novo = registrarUso({ ...estado, pendente: proximo }, categoria, fala.id);
  await gravarEstadoFala(kv, chatId, novo);
  return { tipo: "texto", texto: textoFinal, categoria, falaId: fala.id };
}

async function preencherFinanceiro(
  kv: HostKvApi,
  chatId: string,
  idOperacao: string,
  categoria: Categoria,
  slots: Slots,
): Promise<{ ok: boolean }> {
  if (categoria === "saldo" || categoria === "extratos" || categoria === "confirmados") {
    const acao = categoria === "saldo" ? "resumo" : "extrato";
    const resultado = await operarConta(kv, chatId, idOperacao, { acao });
    if (resultado.saldo === undefined) return { ok: false };
    slots.saldo = resultado.saldo;
    if (categoria === "extratos" || categoria === "confirmados") {
      const itens = resultado.extrato ?? [];
      const filtrado =
        categoria === "confirmados"
          ? itens.filter((item) => item.tipo === "deposito" || item.tipo === "pix_recebido")
          : itens;
      if (filtrado.length === 0) {
        slots.extrato =
          categoria === "confirmados"
            ? "Nenhum depósito confirmado ainda."
            : "Ainda não há movimentação.";
      } else {
        slots.extrato = filtrado
          .slice(-6)
          .map((item) => `${item.tipo} R$ ${item.valor} ${item.descricao}`)
          .join("; ");
      }
    }
    return { ok: true };
  }
  if (categoria === "pendentes") {
    const resumo = await operarConta(kv, chatId, `${idOperacao}:saldo`, { acao: "resumo" });
    slots.saldo = resumo.saldo;
    const lista = sqlDisponivel() ? await listarCobrancasSql(chatId, 8) : await listarCobrancas(kv, chatId, 8);
    const abertas = lista.filter((item) => item.status === "aberta");
    slots.pendencias =
      abertas.length === 0
        ? "Nenhuma cobrança aberta agora."
        : abertas.map((item) => `R$ ${reaisDe(item.valorCentavos)} (${item.id})`).join("; ");
    return { ok: true };
  }
  return { ok: true };
}

function falaPrecisaClube(categoria: Categoria): boolean {
  return categoria === "clube";
}

function preencherClube(slots: Slots, clube: NonNullable<Awaited<ReturnType<typeof consultarClube>>>): void {
  const ouro = configAtual().xpOuro;
  slots.lbcoins = String(clube.saldo);
  slots.categoria = rotuloCategoria(clube.categoria);
  slots.xp = String(clube.xp);
  slots.faltaOuro = String(Math.max(0, ouro - clube.xp));
  slots.codigo = clube.codigo;
  slots.link = clube.link;
  slots.indicadas = String(clube.indicadas);
  slots.aprovadas = String(clube.aprovadas);
  slots.pendentes = String(clube.pendentes);
  slots.ganho = String(clube.ganhoIndicacao);
  slots.beneficios = clube.beneficios.join(" ");
}
