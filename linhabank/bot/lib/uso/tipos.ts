export type ModoUso = "dialogo" | "menu";

export type PendenteUso =
  | { etapa: "receber" }
  | { etapa: "chave" }
  | { etapa: "valor"; chave: string }
  | {
      etapa: "confirmar";
      chave: string;
      valor: string;
      destino: string;
      taxa?: string;
      interno?: boolean;
    };

export type BotaoUso = { text: string; callback_data: string };

export type TelaUso = {
  texto: string;
  teclado: BotaoUso[][];
};
