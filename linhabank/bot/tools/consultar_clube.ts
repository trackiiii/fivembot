import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";

import { chatDaSessao } from "../lib/banco.js";
import { consultarClube, rotuloCategoria } from "../lib/fidelidade/index.js";

export default defineTool({
  description:
    "Lê o LINHABANK CLUB desta conta: LBcoins, categoria, XP, código de indicação, indicações e benefícios reais. Chame antes de falar saldo de LBcoins, categoria, indicação ou benefício. Não invente número. LBcoins não são dinheiro. Não use esta ferramenta para aprovar, creditar ou alterar nada.",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_pedido, ctx) {
    const chatId = chatDaSessao(ctx.session.continuationKey);
    if (chatId === undefined) {
      return { ok: false as const, motivo: "sem_sessao" as const };
    }
    const resumo = await consultarClube(ctx.host.kv, chatId);
    if (resumo === undefined) {
      return { ok: false as const, motivo: "sem_conta" as const };
    }
    return {
      ok: true as const,
      lbcoins: resumo.saldo,
      totalRecebido: resumo.totalRecebido,
      totalUtilizado: resumo.totalUtilizado,
      categoria: rotuloCategoria(resumo.categoria),
      xp: resumo.xp,
      codigo: resumo.codigo,
      link: resumo.link,
      indicadas: resumo.indicadas,
      pendentes: resumo.pendentes,
      aprovadas: resumo.aprovadas,
      rejeitadas: resumo.rejeitadas,
      ganhoIndicacao: resumo.ganhoIndicacao,
      beneficios: resumo.beneficios,
      recompensasBloqueadas: resumo.recompensasBloqueadas,
    };
  },
});
