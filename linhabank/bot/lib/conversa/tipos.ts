export const CATEGORIAS = [
  "saudacoes",
  "apresentacao",
  "informal",
  "linhabank",
  "cadastro",
  "saldo",
  "depositos",
  "pendentes",
  "confirmados",
  "transferencias",
  "extratos",
  "comprovantes",
  "tecnico",
  "seguranca",
  "faq",
  "reclamacoes",
  "impaciente",
  "agradecimentos",
  "despedidas",
  "incompreensao",
  "clube",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

export type Fala = {
  id: string;
  texto: string;
};

export type Slots = {
  nome?: string;
  saldo?: string;
  valor?: string;
  taxa?: string;
  destino?: string;
  comprovante?: string;
  extrato?: string;
  pendencias?: string;
  lbcoins?: string;
  categoria?: string;
  xp?: string;
  faltaOuro?: string;
  codigo?: string;
  link?: string;
  indicadas?: string;
  aprovadas?: string;
  pendentes?: string;
  ganho?: string;
  beneficios?: string;
};

export type EstadoFala = {
  ultimaId?: string;
  ultimaCategoria?: Categoria;
  pendente?: "valor_deposito" | "ajuda";
};

export type PedidoLocal = {
  texto: string;
  nome: string;
  temConta: boolean;
  historicoVazio: boolean;
  slots: Slots;
  estado: EstadoFala;
};

export type ResultadoLocal =
  | { tipo: "modelo" }
  | { tipo: "texto"; texto: string; categoria: Categoria; falaId: string }
  | { tipo: "deposito"; texto: string; categoria: Categoria; falaId: string; valor: string; copiaECola: string };
