import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { chatDaSessao } from "../lib/banco.js";
import { cancelarAgendamento, criarAgendamento, listarAgendamentos, type ResultadoAgenda } from "../lib/agenda.js";
import { RESPOSTA_SEM_CONTA } from "../lib/respostas.js";

const frequencias: Record<string, "uma_vez" | "diaria" | "semanal" | "mensal"> = {
  uma_vez: "uma_vez",
  "uma vez": "uma_vez",
  diaria: "diaria",
  "diária": "diaria",
  "todo dia": "diaria",
  semanal: "semanal",
  "toda semana": "semanal",
  mensal: "mensal",
  "todo mês": "mensal",
  "todo mes": "mensal",
};

function valorTexto(valor: string | number | undefined): string | undefined {
  if (typeof valor === "string") return valor;
  if (typeof valor !== "number" || !Number.isFinite(valor)) return undefined;
  return valor.toFixed(2).replace(".", ",");
}

function frequenciaTexto(valor: string | undefined): string | undefined {
  if (valor === undefined) return undefined;
  return frequencias[valor.trim().toLowerCase()] ?? valor.trim().toLowerCase();
}

export default defineTool({
  description:
    "Cria, lista ou cancela um PIX agendado desta conta. O PIX não sai no momento do agendamento: no horário, o envio acontece sozinho e continua até o cliente cancelar. Chave de conta LinhaBank é reconhecida e esse envio não tem taxa. Chame criar só depois de repetir valor, chave, frequência e horário e ouvir um sim. Chame cancelar só depois de o cliente confirmar o código. Não use operar_conta para agendar. Nunca fale ao cliente a palavra gateway, nem referência, webhook ou como a ligação interna funciona. Na resposta, use o campo texto.",
  effect: ({ acao }) => (acao === "listar" ? "read" : "write"),
  inputSchema: z.object({
    acao: z.string().describe("criar, listar ou cancelar."),
    valor: z.union([z.string(), z.number()]).optional().describe("Valor em reais, como 10,50. Obrigatório em criar."),
    chavePix: z
      .string()
      .optional()
      .describe("Chave PIX de fora: e-mail, celular +55, CPF, CNPJ ou chave aleatória. Obrigatória em criar."),
    chave: z.string().optional().describe("O mesmo que chavePix, se a chave vier neste campo."),
    frequencia: z
      .string()
      .optional()
      .describe("uma_vez, diaria, semanal ou mensal. Obrigatória em criar."),
    data: z
      .string()
      .optional()
      .describe("Dia do primeiro envio, AAAA-MM-DD ou DD/MM/AAAA, no horário de Brasília. Obrigatório em criar."),
    inicio: z.string().optional().describe("O mesmo que data, se o dia vier neste campo."),
    hora: z.string().optional().describe("Hora do envio, HH:MM, no horário de Brasília. Obrigatória em criar."),
    horario: z.string().optional().describe("O mesmo que hora, se o horário vier neste campo."),
    id: z.string().optional().describe("Código do agendamento, como AG-1A2B3C4D. Obrigatório em cancelar."),
  }),
  async execute(pedido, ctx): Promise<ResultadoAgenda> {
    const chatId = chatDaSessao(ctx.session.continuationKey);
    if (chatId === undefined) return { ok: false, motivo: "sem_conta", texto: RESPOSTA_SEM_CONTA, agendamentos: [] };
    const acao = pedido.acao.trim().toLowerCase();
    if (acao === "listar") return listarAgendamentos(ctx.host.kv, chatId);
    if (acao === "cancelar") return cancelarAgendamento(ctx.host.kv, chatId, pedido.id);
    if (acao !== "criar") {
      return {
        ok: false,
        motivo: "horario_invalido",
        texto: "Para agendar, preciso do valor, da chave, da frequência e do horário.",
        agendamentos: [],
      };
    }
    return criarAgendamento(ctx.host.kv, chatId, {
      valor: valorTexto(pedido.valor),
      chavePix: pedido.chavePix ?? pedido.chave,
      frequencia: frequenciaTexto(pedido.frequencia),
      data: pedido.data ?? pedido.inicio,
      hora: pedido.hora ?? pedido.horario,
    });
  },
});
