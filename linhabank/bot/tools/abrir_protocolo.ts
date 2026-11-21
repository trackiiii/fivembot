import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import {
  chaveIdempotencia,
  chaveProtocolo,
  chaveProtocolosDaSessao,
  novoProtocolo,
} from "../lib/atendimento.js";

const assuntos = ["conta", "pix", "cartao", "app", "outro"] as const;

type Assunto = (typeof assuntos)[number];

type ProtocoloAberto = {
  aberto: true;
  protocolo: string;
  assunto: Assunto;
  resumo: string;
};

type ProtocoloRecusado = {
  aberto: false;
  motivo: "resumo_curto";
};

function lerAberto(valor: unknown): { protocolo: string; assunto: string; resumo: string } | undefined {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  const registro = valor as Record<string, unknown>;
  if (registro.aberto !== true) return undefined;
  if (typeof registro.protocolo !== "string") return undefined;
  if (typeof registro.assunto !== "string") return undefined;
  if (typeof registro.resumo !== "string") return undefined;
  return {
    protocolo: registro.protocolo,
    assunto: registro.assunto,
    resumo: registro.resumo,
  };
}

export default defineTool({
  description:
    "Abre um protocolo de atendimento do LinhaBank. Não movimenta conta, PIX nem cartão. Repetir a mesma chamada na mesma sessão devolve o mesmo protocolo.",
  effect: "write",
  inputSchema: z.object({
    assunto: z.enum(assuntos).describe("Tema do pedido: conta, pix, cartao, app ou outro."),
    resumo: z.string().describe("Resumo do pedido do cliente, em uma frase."),
  }),
  async execute({ assunto, resumo }, ctx): Promise<ProtocoloAberto | ProtocoloRecusado> {
    const limpo = resumo.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, 280);
    if (limpo.length < 8) return { aberto: false, motivo: "resumo_curto" };

    const chave = chaveIdempotencia(ctx.session.id, assunto, limpo);
    const existente = lerAberto(await ctx.host.kv.get(chave));
    if (
      existente !== undefined &&
      existente.assunto === assunto &&
      existente.resumo === limpo
    ) {
      return {
        aberto: true,
        protocolo: existente.protocolo,
        assunto,
        resumo: limpo,
      };
    }

    const registro: ProtocoloAberto = {
      aberto: true,
      protocolo: novoProtocolo(),
      assunto,
      resumo: limpo,
    };
    await ctx.host.kv.put(chave, registro);
    await ctx.host.kv.put(chaveProtocolo(registro.protocolo), registro);
    const lista = await ctx.host.kv.get(chaveProtocolosDaSessao(ctx.session.id));
    const ids = Array.isArray(lista) ? lista.filter((item): item is string => typeof item === "string") : [];
    if (!ids.includes(registro.protocolo)) ids.push(registro.protocolo);
    await ctx.host.kv.put(chaveProtocolosDaSessao(ctx.session.id), ids);
    return registro;
  },
});
