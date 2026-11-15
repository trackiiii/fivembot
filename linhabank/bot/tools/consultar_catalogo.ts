import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { CATALOGO, TEMAS, type Tema } from "../lib/catalogo.js";

const temas = z.enum(TEMAS);

export default defineTool({
  description:
    "Lê o catálogo público do LinhaBank. Chame antes de falar de conta, PIX, cartão, horário ou segurança. Não invente fato fora do retorno.",
  effect: "read",
  inputSchema: z.object({
    tema: z.preprocess(
      (valor) => (typeof valor === "string" ? valor.trim().toLowerCase() : valor),
      temas,
    ).describe("conta, pix, cartao, atendimento ou seguranca."),
  }),
  execute({ tema }): { encontrado: true; tema: Tema; titulo: string; fatos: string[] } {
    const item = CATALOGO[tema];
    return { encontrado: true, tema, titulo: item.titulo, fatos: item.fatos };
  },
});
