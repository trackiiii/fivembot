import { defineEval, includes } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["conversa"],
  description: "A Thialinha puxa o próximo passo sem largar o catálogo.",
  cases: [
    {
      id: "pix",
      description: "A resposta de PIX termina com uma pergunta.",
      async test(t) {
        await t.send("O PIX do LinhaBank funciona de madrugada?");
        t.succeeded();
        t.calledTool("consultar_catalogo");
        t.notCalledTool("abrir_protocolo");
        t.check(t.reply, includes(/PIX/i));
        t.check(t.reply, includes(/\?/));
      },
    },
    {
      id: "oi",
      description: "Uma saudação vaga oferece um próximo passo.",
      async test(t) {
        await t.send("oi, tô meio perdido aqui");
        t.succeeded();
        t.notCalledTool("abrir_protocolo");
        t.check(t.reply, includes(/\?/));
      },
    },
  ],
});
