import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "LinhaBank",
  description:
    "Atendimento do LinhaBank em diálogo com a Thialinha, atendente IA.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "low" },
      { id: "fast", value: "true" },
    ],
  },
  // Sem shell e sem arquivos. O modelo só alcança as ferramentas do servidor.
  tools: [],
  hosting: {
    egressDomains: ["api.telegram.org"],
    secretNames: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "PIX_GATEWAY_TOKEN", "PIX_GATEWAY_WEBHOOK_SECRET"],
  },
});
