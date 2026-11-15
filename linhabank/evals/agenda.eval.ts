import { defineEval, includes, satisfies } from "@grok/agent-sdk/evals";

function entrada(mensagem: string): string {
  return JSON.stringify({
    mensagem,
    contexto: {
      nome: "Ana",
      historico: [
        {
          papel: "thialinha",
          texto: "Oi, Ana. Sou a Thialinha, atendente IA do LinhaBank. Em que posso ajudar?",
        },
      ],
      protocolos: [],
      conta: { aberta: true, acabouDeAbrir: false },
    },
  });
}

const semLigacao = satisfies(
  (texto) => typeof texto === "string" && !/gateway|webhook/i.test(texto),
  "sem ligacao interna",
);

export default defineEval({
  tags: ["agenda"],
  description: "A Thialinha confirma o PIX agendado antes de criar e não dispara um PIX imediato.",
  async test(t) {
    const pedido = await t.send(
      entrada(
        "Quero agendar um PIX de R$ 10,00 para ana@email.com todo dia às 09:00, começando em 20/12/2026.",
      ),
    );
    pedido.succeeded();
    pedido.notCalledTool("agendar_pix");
    pedido.notCalledTool("operar_conta");
    t.check(pedido.message, includes(/\?/));
    t.check(pedido.message, semLigacao);

    const confirmacao = await t.send(entrada("Sim, pode agendar."));
    confirmacao.succeeded();
    confirmacao.calledTool("agendar_pix");
    confirmacao.notCalledTool("operar_conta");
    t.check(confirmacao.message, semLigacao);
  },
});
