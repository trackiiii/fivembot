import type { Categoria } from "./tipos.js";

export type Intencao =
  | { categoria: Categoria; confianca: number }
  | { categoria: "modelo"; confianca: 1 };

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s,./+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tem(texto: string, trechos: string[]): boolean {
  return trechos.some((item) => texto.includes(item));
}

function soSaudacao(texto: string): boolean {
  return /^(oi+|oii+|ola|olá|eai|e ai|eae|hey|opa+|iae|iae+|bom dia|boa tarde|boa noite|salve)s?$/.test(texto);
}

function valorIsolado(texto: string): boolean {
  return /^r?\$?\s*\d{1,7}([.,]\d{1,2})?$/.test(texto.replace(/\s/g, ""));
}

function chaveExterna(texto: string): boolean {
  return /@/.test(texto) || /\+55\d{10,11}/.test(texto) || /\b\d{11}\b/.test(texto) || /\b\d{14}\b/.test(texto);
}

function pedidoEnvio(texto: string): boolean {
  return tem(texto, ["manda", "mandar", "enviar", "envia", "transfere", "transferir", "pix pra", "pix para", "pix pro"]);
}

function pedidoReceber(texto: string): boolean {
  if (/\brecebi\b/.test(texto) || tem(texto, ["pix recebido", "ja recebi", "já recebi"])) return false;
  if (
    tem(texto, [
      "receber pix",
      "receber um pix",
      "receber o pix",
      "receber dinheiro",
      "quero receber",
      "pra receber",
      "para receber",
      "como recebo",
      "como receber",
      "gerar qr",
      "gera qr",
      "gerar o qr",
      "gera o qr",
      "gerar um qr",
      "gera um qr",
      "gerar pix",
      "gera pix",
      "gerar um pix",
      "gera um pix",
      "me gera",
      "me manda o qr",
      "manda o qr",
      "quero um qr",
      "pix pra mim",
      "pix para mim",
      "pix de entrada",
      "depositar pix",
      "deposito pix",
      "depósito pix",
      "qr do pix",
      "meu qr",
    ])
  ) {
    return true;
  }
  if (/^(receber|recebe|recebimento|depositar|deposito|depósito|qr)$/.test(texto)) return true;
  return /\breceber\b/.test(texto) && !pedidoEnvio(texto);
}

export function classificarTexto(textoBruto: string, pendente?: "valor_deposito" | "ajuda"): Intencao {
  const texto = normalizar(textoBruto);
  if (texto.length === 0) return { categoria: "incompreensao", confianca: 0.4 };

  if (
    tem(texto, ["senha", "cvv", "cvc", "pin", "token", "codigo sms", "código sms"]) ||
    /\b\d{3,4}\b/.test(texto) && tem(texto, ["cartao", "cartão", "validade"])
  ) {
    return { categoria: "seguranca", confianca: 0.95 };
  }

  if (tem(texto, ["agendar", "agendamento", "todo dia", "toda semana", "todo mes", "protocolo", "boleto", "bloquear cartao", "desbloquear"])) {
    return { categoria: "modelo", confianca: 1 };
  }

  if (pedidoEnvio(texto) && (chaveExterna(texto) || tem(texto, ["lb"])) && /\d/.test(texto)) {
    return { categoria: "modelo", confianca: 1 };
  }

  if (pendente === "valor_deposito" && (valorIsolado(texto) || tem(texto, ["reais", "real"]))) {
    return { categoria: "depositos", confianca: 0.9 };
  }

  if (tem(texto, ["comprovante", "print do pix", "print do pagamento", "ja paguei", "já paguei", "paguei ja", "segue o pix", "comprovante do pix"])) {
    return { categoria: "comprovantes", confianca: 0.9 };
  }

  if (tem(texto, ["demora", "demorando", "to esperando", "tô esperando", "absurdo", "ridiculo", "ridículo", "porra", "caralho", "vai logo", "anda logo", " palhaçada", "palhacada"])) {
    if (tem(texto, ["saldo"])) return { categoria: "saldo", confianca: 0.8 };
    if (tem(texto, ["deposit", "cair", "caiu", "pix"])) return { categoria: "pendentes", confianca: 0.75 };
    return { categoria: "impaciente", confianca: 0.85 };
  }

  if (tem(texto, ["reclama", "reclamacao", "péssimo", "pessimo", "odio", "ódio", "horrivel", "horrível", "processo", "procon", "absurdo isso"])) {
    return { categoria: "reclamacoes", confianca: 0.8 };
  }

  if (tem(texto, ["obrigad", "valeu", "agradec", "muito bom", "top demais", "ajudou"])) {
    return { categoria: "agradecimentos", confianca: 0.85 };
  }

  if (tem(texto, ["tchau", "ate mais", "até mais", "ate logo", "até logo", "falou", "flw", "vou embora", "vou dormir"])) {
    return { categoria: "despedidas", confianca: 0.85 };
  }

  if (tem(texto, ["quem e voce", "quem é você", "quem e tu", "seu nome", "thialinha", "voce e robô", "você é robô", "e uma ia", "é uma ia", "e bot"])) {
    return { categoria: "apresentacao", confianca: 0.9 };
  }

  if (tem(texto, ["o que e o linhabank", "que e linhabank", "o que é o linhabank", "como funciona o linhabank", "linhabank e o que", "o que vocês fazem", "o que voces fazem"])) {
    return { categoria: "linhabank", confianca: 0.9 };
  }

  if (tem(texto, ["saldo", "quanto tenho", "quanto tem na conta", "quanto tem na minha", "meu dinheiro"])) {
    return { categoria: "saldo", confianca: 0.92 };
  }

  if (tem(texto, ["extrato", "historico", "histórico", "movimentacao", "movimentação", "ultimas transacoes", "últimas transações"])) {
    return { categoria: "extratos", confianca: 0.9 };
  }

  if (tem(texto, ["nao caiu", "não caiu", "ainda nao entrou", "ainda não entrou", "pendente", "cadê o pix", "cade o pix", "to no aguardo", "tô no aguardo"])) {
    return { categoria: "pendentes", confianca: 0.88 };
  }

  if (tem(texto, ["caiu", "confirmou", "deposito confirmado", "depósito confirmado", "entrou o pix", "pix recebido", "recebi o pix", "recebi um pix", "ja recebi", "já recebi"])) {
    return { categoria: "confirmados", confianca: 0.85 };
  }

  if (
    pedidoReceber(texto) ||
    tem(texto, ["deposit", "colocar dinheiro", "por dinheiro", "entrar dinheiro", "qr code", "qrcode", "copia e cola", "copia cola"])
  ) {
    return { categoria: "depositos", confianca: 0.92 };
  }

  if (tem(texto, ["transfere", "transferir", "mandar pix", "enviar pix", "fazer um pix", "fazer pix", "pix para", "pix pra", "manda pix", "envia pix"])) {
    return { categoria: "transferencias", confianca: 0.8 };
  }

  if (tem(texto, ["abrir conta", "criar conta", "me cadastr", "termos", "/start", "concordo", "como abro"])) {
    return { categoria: "cadastro", confianca: 0.85 };
  }

  if (tem(texto, ["seguro", "golpe", "fraude", "senha", "nao peço", "não peço"])) {
    return { categoria: "seguranca", confianca: 0.75 };
  }

  if (tem(texto, ["pix de madrugada", "funciona de noite", "taxa", "limite", "cartao virtual", "cartão virtual", "agendar pix", "horario", "24 hora"])) {
    return { categoria: "faq", confianca: 0.8 };
  }

  if (tem(texto, ["erro", "bug", "nao funciona", "não funciona", "travou", "fora do ar", "falhou"])) {
    return { categoria: "tecnico", confianca: 0.7 };
  }

  if (soSaudacao(texto) || tem(texto, ["bom dia", "boa tarde", "opa", "oii", "oie"])) {
    return { categoria: "saudacoes", confianca: 0.9 };
  }

  if (tem(texto, ["haha", "kkk", "rs", "tudo bem", "td bem", "beleza", "suave", "tranquilo", "so passando", "só passando"])) {
    return { categoria: "informal", confianca: 0.7 };
  }

  if (/^[.?!,;:\-\s]+$/.test(texto) || texto.length < 2) {
    return { categoria: "incompreensao", confianca: 0.4 };
  }

  return { categoria: "modelo", confianca: 1 };
}

export function extrairValorDeposito(texto: string): string | undefined {
  const achado = texto.match(/(\d{1,7})(?:[.,](\d{1,2}))?/);
  if (achado === null) return undefined;
  const reais = achado[1];
  const cents = (achado[2] ?? "00").padEnd(2, "0");
  if (reais === undefined) return undefined;
  return `${reais},${cents}`;
}
