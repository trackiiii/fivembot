import { defineSchedule } from "@grok/agent-sdk/schedules";

import { processarAgendamentos } from "../lib/agenda.js";

export default defineSchedule({
  cron: "* * * * *",
  async run({ host }) {
    await processarAgendamentos(host.kv);
  },
});
