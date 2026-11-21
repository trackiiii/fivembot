import { defineEval, includes, satisfies } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["conta"],
  description: "Sem aceite dos termos, a Thialinha não inventa saldo.",
  async test(t) {
    await t.send("qual é o meu saldo?");
    t.succeeded();
    t.calledTool("operar_conta");
    t.notCalledTool("abrir_protocolo");
    t.check(t.reply, includes(/termo|concordo|\/start/i));
    t.check(
      t.reply,
      satisfies((texto) => typeof texto === "string" && !/R\$\s*\d/.test(texto), "sem valor inventado"),
    );
  },
});
