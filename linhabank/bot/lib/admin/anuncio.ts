import type { HostKvApi, JsonValue } from "@grok/agent-sdk";

import { enviarFotoId, enviarTexto } from "../atendimento.js";
import { listarChatIdsClientes } from "../banco.js";
import { formatarQuando } from "../horario.js";

type BotaoAdmin = { text: string; callback_data: string };
type TelaAdmin = { texto: string; teclado: BotaoAdmin[][]; aviso?: string };

export const CHAVE_RASCUNHO = (chatId: string) => `linhabank:admin:anuncio:${chatId}`;
export const CHAVE_HISTORICO = "linhabank:anuncios";

const LIMITE_TEXTO = 3500;
const LIMITE_CAPTION = 1024;
const LIMITE_HISTORICO = 8;

export type RascunhoAnuncio = {
  texto: string;
  fotoId?: string;
};

export type AnuncioEnviado = {
  em: string;
  texto: string;
  foto: boolean;
  destinatarios: number;
  entregues: number;
  falhas: number;
  operador: string;
};

export function textoClienteAnuncio(texto: string): string {
  const corpo = texto.trim();
  if (corpo.length === 0) return "LINHABANK\nComunicado";
  return `LINHABANK\nComunicado\n\n${corpo}`;
}

export function rascunhoVazio(valor: RascunhoAnuncio | undefined): boolean {
  if (valor === undefined) return true;
  return valor.texto.trim().length === 0 && valor.fotoId === undefined;
}

export function fotoIdValido(valor: string | undefined): valor is string {
  return typeof valor === "string" && /^[\w-]{10,200}$/.test(valor);
}

export async function lerRascunho(kv: HostKvApi, chatId: string): Promise<RascunhoAnuncio> {
  const bruto = await kv.get(CHAVE_RASCUNHO(chatId));
  if (bruto === null || bruto === undefined || typeof bruto !== "object" || Array.isArray(bruto)) {
    return { texto: "" };
  }
  const texto = typeof bruto.texto === "string" ? bruto.texto : "";
  const fotoId = typeof bruto.fotoId === "string" && fotoIdValido(bruto.fotoId) ? bruto.fotoId : undefined;
  return fotoId === undefined ? { texto } : { texto, fotoId };
}

export async function gravarRascunho(kv: HostKvApi, chatId: string, rascunho: RascunhoAnuncio): Promise<void> {
  await kv.put(CHAVE_RASCUNHO(chatId), {
    texto: rascunho.texto,
    ...(rascunho.fotoId !== undefined ? { fotoId: rascunho.fotoId } : {}),
  });
}

export async function limparRascunho(kv: HostKvApi, chatId: string): Promise<void> {
  await kv.delete(CHAVE_RASCUNHO(chatId));
}

export async function lerHistorico(kv: HostKvApi): Promise<AnuncioEnviado[]> {
  const bruto = await kv.get(CHAVE_HISTORICO);
  if (!Array.isArray(bruto)) return [];
  const itens: AnuncioEnviado[] = [];
  for (const item of bruto) {
    const lido = comoHistorico(item);
    if (lido !== undefined) itens.push(lido);
  }
  return itens.slice(0, LIMITE_HISTORICO);
}

export async function registrarEnvio(kv: HostKvApi, item: AnuncioEnviado): Promise<void> {
  const atual = await lerHistorico(kv);
  await kv.put(CHAVE_HISTORICO, [item, ...atual].slice(0, LIMITE_HISTORICO) as unknown as JsonValue);
}

export function cortarTextoAnuncio(texto: string): string | undefined {
  const limpo = texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (limpo.length === 0) return undefined;
  if (limpo.startsWith("/")) return undefined;
  return limpo.length > LIMITE_TEXTO ? `${limpo.slice(0, LIMITE_TEXTO - 1)}…` : limpo;
}

export async function aplicarTextoRascunho(
  kv: HostKvApi,
  chatId: string,
  texto: string,
): Promise<RascunhoAnuncio | undefined> {
  const cortado = cortarTextoAnuncio(texto);
  if (cortado === undefined) return undefined;
  const atual = await lerRascunho(kv, chatId);
  const proximo = { ...atual, texto: cortado };
  await gravarRascunho(kv, chatId, proximo);
  return proximo;
}

export async function aplicarFotoRascunho(
  kv: HostKvApi,
  chatId: string,
  fotoId: string | undefined,
  caption?: string,
): Promise<{ rascunho: RascunhoAnuncio; aviso: string } | undefined> {
  if (!fotoIdValido(fotoId)) return undefined;
  const atual = await lerRascunho(kv, chatId);
  const textoCaption = caption === undefined ? undefined : cortarTextoAnuncio(caption);
  const proximo: RascunhoAnuncio = {
    texto: textoCaption ?? atual.texto,
    fotoId,
  };
  await gravarRascunho(kv, chatId, proximo);
  return { rascunho: proximo, aviso: "Imagem anexada ao comunicado." };
}

export async function telaAnuncio(kv: HostKvApi, chatId: string, nav: BotaoAdmin[][]): Promise<TelaAdmin> {
  const rascunho = await lerRascunho(kv, chatId);
  const destinos = await listarChatIdsClientes(kv, true);
  const historico = await lerHistorico(kv);
  const linhasHistorico =
    historico.length === 0
      ? ["Nenhum comunicado enviado."]
      : historico.slice(0, 3).map((item) => {
          const imagem = item.foto ? "  ·  com imagem" : "";
          return `${formatarQuando(item.em)}  ·  ${item.entregues}/${item.destinatarios} entregue(s)${imagem}\n    ${trecho(item.texto)}`;
        });
  const texto = [
    "Anúncio",
    "Envio para as contas ativas do LinhaBank.",
    "",
    `Destinatários: ${destinos.length} conta(s)`,
    "",
    "RASCUNHO",
    `Texto: ${rascunho.texto.trim().length === 0 ? "não informado" : trecho(rascunho.texto, 240)}`,
    `Imagem: ${rascunho.fotoId === undefined ? "não anexada" : "anexada"}`,
    "",
    "Envie o texto nesta conversa. Envie a imagem como foto. Depois use Prévia ou Enviar a todos.",
    "",
    "ÚLTIMOS",
    ...linhasHistorico,
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav,
      [
        { text: "Prévia", callback_data: "a:np" },
        { text: "Limpar", callback_data: "a:nl" },
      ],
      [{ text: "Enviar a todos", callback_data: "a:ns" }],
    ],
  };
}

export function telaConfirmarAnuncio(
  rascunho: RascunhoAnuncio,
  destinatarios: number,
  nav: BotaoAdmin[][],
): TelaAdmin {
  const texto = [
    "Confirmar envio",
    "",
    `O comunicado vai para ${destinatarios} conta(s).`,
    `Imagem: ${rascunho.fotoId === undefined ? "não" : "sim"}`,
    "",
    rascunho.texto.trim().length === 0 ? "Sem texto. A imagem segue sozinha." : trecho(rascunho.texto, 500),
    "",
    "A entrega é imediata. Clientes que bloquearam o bot não recebem.",
  ].join("\n");
  return {
    texto,
    teclado: [
      ...nav,
      [
        { text: "Confirmar envio", callback_data: "a:ny" },
        { text: "Cancelar", callback_data: "a:z" },
      ],
    ],
  };
}

export async function entregarPrevia(chatId: string, rascunho: RascunhoAnuncio): Promise<boolean> {
  return entregarUm(chatId, rascunho);
}

export async function enviarAnuncioAosClientes(
  kv: HostKvApi,
  rascunho: RascunhoAnuncio,
  operador: string,
): Promise<{ destinatarios: number; entregues: number; falhas: number }> {
  const destinos = await listarChatIdsClientes(kv, true);
  let entregues = 0;
  let falhas = 0;
  for (const destino of destinos) {
    const ok = await entregarUm(destino, rascunho);
    if (ok) entregues += 1;
    else falhas += 1;
  }
  await registrarEnvio(kv, {
    em: new Date().toISOString(),
    texto: rascunho.texto.trim(),
    foto: rascunho.fotoId !== undefined,
    destinatarios: destinos.length,
    entregues,
    falhas,
    operador,
  });
  await limparRascunho(kv, operador);
  return { destinatarios: destinos.length, entregues, falhas };
}

async function entregarUm(chatId: string, rascunho: RascunhoAnuncio): Promise<boolean> {
  const corpo = textoClienteAnuncio(rascunho.texto);
  if (rascunho.fotoId !== undefined) {
    if (corpo.length <= LIMITE_CAPTION) {
      return enviarFotoId(chatId, rascunho.fotoId, corpo, { prefixo: false });
    }
    const foto = await enviarFotoId(chatId, rascunho.fotoId, undefined, { prefixo: false });
    const texto = await enviarTexto(chatId, corpo, { prefixo: false });
    return foto || texto;
  }
  return enviarTexto(chatId, corpo, { prefixo: false });
}

function trecho(texto: string, limite = 120): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length === 0) return "—";
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

function comoHistorico(valor: JsonValue): AnuncioEnviado | undefined {
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return undefined;
  if (typeof valor.em !== "string" || typeof valor.destinatarios !== "number") return undefined;
  return {
    em: valor.em,
    texto: typeof valor.texto === "string" ? valor.texto : "",
    foto: valor.foto === true,
    destinatarios: valor.destinatarios,
    entregues: typeof valor.entregues === "number" ? valor.entregues : 0,
    falhas: typeof valor.falhas === "number" ? valor.falhas : 0,
    operador: typeof valor.operador === "string" ? valor.operador : "",
  };
}
