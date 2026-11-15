import { prepararFala, sintetizarVoz, textoParaFala, vozDisponivel } from "../bot/lib/voz.js";

function assert(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(mensagem);
}

{
  assert(textoParaFala("Thialinha: Oi, tudo bem?") === "Oi, tudo bem?", "prefixo ficou na fala");
  assert(textoParaFala("<b>Thialinha</b>: Seu saldo é R$ 10,00") === "Seu saldo é 10 reais", "reais não viraram fala");
  assert(textoParaFala("R$ 10,50 na conta") === "10 reais e 50 centavos na conta", "centavos não viraram fala");
  assert(textoParaFala("00020126580014br.gov.bcb.pix") === undefined, "BR Code foi falado");
  assert(textoParaFala("a") === undefined, "letra solta foi falada");
  assert(textoParaFala("Veja https://linhabank.test/x agora") === "Veja agora", "URL ficou na fala");
  assert(prepararFala("Oi, Thialinha. Saldo no LinhaBank.") === "Oi, Tia linha. Saldo no Linha Bank.", "nomes na fala");
}

if (vozDisponivel()) {
  const audio = await sintetizarVoz("Oi, eu sou a Thialinha. Te atendo no LinhaBank.");
  assert(audio !== undefined && audio.length > 4000, "síntese de voz curta demais");
  assert(audio![0] === 0x4f && audio![1] === 0x67 && audio![2] === 0x67 && audio![3] === 0x53, "áudio não é Ogg");
}

console.log("voz ok");
