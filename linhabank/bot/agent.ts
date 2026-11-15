import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "LinhaBank",
  description:
    "Atendimento do LinhaBank em diálogo com a Thialinha, com mini-app da conta no Telegram.",
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
    egressDomains: ["api.telegram.org", "api.asaas.com", "api-sandbox.asaas.com"],
    secretNames: [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET",
      "PIX_GATEWAY_TOKEN",
      "PIX_GATEWAY_WEBHOOK_SECRET",
      "ASAAS_API_KEY",
      "ASAAS_WEBHOOK_TOKEN",
      "ADMIN_TOKEN",
    ],
  },
});
