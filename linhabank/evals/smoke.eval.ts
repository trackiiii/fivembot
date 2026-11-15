import { defineEval, includes, satisfies } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "A Thialinha consulta o catálogo antes de falar de PIX.",
  async test(t) {
    await t.send("O PIX do LinhaBank funciona de madrugada?");
    t.succeeded();
    t.calledTool("consultar_catalogo");
    t.notCalledTool("abrir_protocolo");
    t.check(t.reply, includes(/PIX/i));
    t.check(t.reply, satisfies((texto) => typeof texto === "string" && !/gateway|webhook/i.test(texto), "sem ligacao interna"));
  },
});
