export const TIPOS_LBCOINS = [
  "recompensa",
  "indicacao",
  "bonus",
  "campanha",
  "resgate",
  "estorno",
] as const;

export type TipoLbcoins = (typeof TIPOS_LBCOINS)[number];

export const STATUS_LBCOINS = ["confirmado", "bloqueado"] as const;
export type StatusLbcoins = (typeof STATUS_LBCOINS)[number];

export const STATUS_INDICACAO = ["pendente", "aprovada", "rejeitada"] as const;
export type StatusIndicacao = (typeof STATUS_INDICACAO)[number];

export const CATEGORIAS_CLUBE = ["bronze", "prata", "ouro"] as const;
export type CategoriaClube = (typeof CATEGORIAS_CLUBE)[number];

export const CRITERIOS_INDICACAO = ["manual", "conta_aberta"] as const;
export type CriterioIndicacao = (typeof CRITERIOS_INDICACAO)[number];

export type CarteiraLbcoins = {
  chatId: string;
  saldo: number;
  totalRecebido: number;
  totalUtilizado: number;
  recompensasBloqueadas: boolean;
  codigoIndicacao: string;
  criadoEm: string;
  versao: number;
};

export type MovimentoLbcoins = {
  id: string;
  chatId: string;
  tipo: TipoLbcoins;
  quantidade: number;
  descricao: string;
  origem: string;
  status: StatusLbcoins;
  idempotencyKey: string;
  em: string;
};

export type Indicacao = {
  id: string;
  indicadorChatId: string;
  indicadoChatId: string;
  codigo: string;
  status: StatusIndicacao;
  motivo?: string;
  criadoEm: string;
  decididoEm?: string;
  decididoPor?: string;
};

export type RecompensaIndicacao = {
  id: string;
  referralId: string;
  chatId: string;
  quantidade: number;
  transacaoId: string;
  em: string;
};

export type XpUsuario = {
  chatId: string;
  xp: number;
  categoria: CategoriaClube;
  categoriaEm: string;
  versao: number;
};

export type HistoricoXp = {
  id: string;
  chatId: string;
  xpAnterior: number;
  xpNovo: number;
  categoriaAnterior: CategoriaClube;
  categoriaNova: CategoriaClube;
  motivo: string;
  em: string;
};

export type AuditoriaAdmin = {
  id: string;
  operadorChatId: string;
  acao: string;
  alvoChatId?: string;
  motivo: string;
  valorAnterior?: string;
  valorNovo?: string;
  em: string;
};

export type ResumoClube = {
  chatId: string;
  codigo: string;
  link: string;
  saldo: number;
  totalRecebido: number;
  totalUtilizado: number;
  xp: number;
  categoria: CategoriaClube;
  categoriaEm: string;
  indicadas: number;
  pendentes: number;
  aprovadas: number;
  rejeitadas: number;
  ganhoIndicacao: number;
  recompensasBloqueadas: boolean;
  beneficios: string[];
  criadoEm: string;
};

export type ResultadoCredito = {
  ok: true;
  carteira: CarteiraLbcoins;
  movimento: MovimentoLbcoins;
  repetido: boolean;
} | {
  ok: false;
  motivo: "saldo_insuficiente" | "bloqueado" | "quantidade_invalida" | "sem_conta" | "tipo_invalido";
};
