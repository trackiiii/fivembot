import { defineEval, includes, satisfies } from "@grok/agent-sdk/evals";

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
        t.check(t.reply, satisfies((texto) => typeof texto === "string" && !/gateway|webhook/i.test(texto), "sem ligacao interna"));
      },
    },
    {
      id: "comprovante",
      description: "Comprovante enviado pelo cliente não credita saldo.",
      async test(t) {
        await t.send("Segue o comprovante, já paguei os 50 reais no PIX.");
        t.succeeded();
        t.notCalledTool("abrir_protocolo");
        t.check(
          t.reply,
          satisfies(
            (texto) => typeof texto === "string" && !/gateway|webhook/i.test(texto) && !/R\$\s*50/.test(texto),
            "sem crédito inventado",
          ),
        );
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
        t.check(t.reply, satisfies((texto) => typeof texto === "string" && !/gateway|webhook/i.test(texto), "sem ligacao interna"));
      },
    },
  ],
});
