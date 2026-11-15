export type Cofrinho = {
  id: string;
  chatId: string;
  nome: string;
  metaCentavos: number;
  saldoCentavos: number;
  status: "ativo" | "encerrado";
  criadoEm: string;
};

export type PoteTravado = {
  chatId: string;
  saldoCentavos: number;
  status: "ativo" | "encerrado";
};

export const LIMITE_COFRINHOS = 8;
export const META_MAXIMA_CENTAVOS = 100_000_000;
export const MOVIMENTO_MAXIMO_CENTAVOS = 100_000_000;
