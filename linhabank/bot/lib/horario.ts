export type Frequencia = "uma_vez" | "diaria" | "semanal" | "mensal";

export type PartesHora = {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  diaSemana: number;
};

const FUSO = "America/Sao_Paulo";
const DIAS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function partesNoBrasil(data: Date): PartesHora {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(data);
  const ler = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  let hora = Number(ler("hour"));
  if (hora === 24) hora = 0;
  return {
    ano: Number(ler("year")),
    mes: Number(ler("month")),
    dia: Number(ler("day")),
    hora,
    minuto: Number(ler("minute")),
    diaSemana: DIAS[ler("weekday")] ?? 0,
  };
}

function deslocamentoMinutos(data: Date): number {
  const nome =
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      timeZoneName: "shortOffset",
    })
      .formatToParts(data)
      .find((parte) => parte.type === "timeZoneName")?.value ?? "GMT-3";
  const achado = nome.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (achado === null) return -180;
  const sinal = achado[1] === "-" ? -1 : 1;
  return sinal * (Number(achado[2]) * 60 + Number(achado[3] ?? "0"));
}

export function instanteNoBrasil(ano: number, mes: number, dia: number, hora: number, minuto: number): Date {
  const marcado = Date.UTC(ano, mes - 1, dia, hora, minuto, 0, 0);
  const primeiro = deslocamentoMinutos(new Date(marcado));
  const ajustado = marcado - primeiro * 60_000;
  const segundo = deslocamentoMinutos(new Date(ajustado));
  return new Date(marcado - segundo * 60_000);
}

export function dataHoraBrasil(data: Date): { data: string; hora: string } {
  const partes = partesNoBrasil(data);
  return {
    data: `${partes.ano}-${String(partes.mes).padStart(2, "0")}-${String(partes.dia).padStart(2, "0")}`,
    hora: `${String(partes.hora).padStart(2, "0")}:${String(partes.minuto).padStart(2, "0")}`,
  };
}

export function formatarQuando(iso: string): string {
  const partes = partesNoBrasil(new Date(iso));
  const dia = String(partes.dia).padStart(2, "0");
  const mes = String(partes.mes).padStart(2, "0");
  const hora = String(partes.hora).padStart(2, "0");
  const minuto = String(partes.minuto).padStart(2, "0");
  return `${dia}/${mes}/${partes.ano} às ${hora}:${minuto}`;
}

export function nomeRepeticao(frequencia: Frequencia, diaSemana: number, diaMes: number): string {
  if (frequencia === "uma_vez") return "uma vez";
  if (frequencia === "diaria") return "todo dia";
  if (frequencia === "mensal") return `todo mês, no dia ${diaMes}`;
  const nome = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][diaSemana] ?? "semana";
  if (diaSemana === 0 || diaSemana === 6) return `todo ${nome}`;
  return `toda ${nome}`;
}

export function somarDiasCivis(iso: string, dias: number): string {
  const partes = partesNoBrasil(new Date(iso));
  const base = new Date(Date.UTC(partes.ano, partes.mes - 1, partes.dia + dias));
  return instanteNoBrasil(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    partes.hora,
    partes.minuto,
  ).toISOString();
}

export function somarMesesCivis(iso: string, meses: number): string {
  const partes = partesNoBrasil(new Date(iso));
  const base = new Date(Date.UTC(partes.ano, partes.mes - 1 + meses, partes.dia));
  return instanteNoBrasil(
    base.getUTCFullYear(),
    base.getUTCMonth() + 1,
    base.getUTCDate(),
    partes.hora,
    partes.minuto,
  ).toISOString();
}

export function passoFrequencia(frequencia: Frequencia, iso: string): string {
  if (frequencia === "semanal") return somarDiasCivis(iso, 7);
  if (frequencia === "mensal") return somarMesesCivis(iso, 1);
  return somarDiasCivis(iso, 1);
}

export function ocorrenciaDevida(frequencia: Frequencia, proximaEm: string, agora: Date): string | undefined {
  if (new Date(proximaEm).getTime() > agora.getTime()) return undefined;
  if (frequencia === "uma_vez") return proximaEm;
  let cursor = proximaEm;
  for (let volta = 0; volta < 400; volta += 1) {
    const seguinte = passoFrequencia(frequencia, cursor);
    if (new Date(seguinte).getTime() > agora.getTime()) return cursor;
    cursor = seguinte;
  }
  return cursor;
}

export function proximaDepois(frequencia: Frequencia, proximaEm: string, agora: Date): string {
  let cursor = proximaEm;
  for (let volta = 0; volta < 400; volta += 1) {
    cursor = passoFrequencia(frequencia, cursor);
    if (new Date(cursor).getTime() > agora.getTime()) return cursor;
  }
  return cursor;
}
