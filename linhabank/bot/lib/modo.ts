import { configAtual } from "./config.js";

export type ModoCarteira = "sandbox" | "live";

export function modoCarteira(): ModoCarteira {
  return configAtual().modo;
}

export function emSandbox(): boolean {
  return modoCarteira() === "sandbox";
}

export function chatsAdmin(): string[] {
  return configAtual()
    .chatsAdmin.split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function ehAdmin(chatId: string): boolean {
  return chatsAdmin().includes(chatId);
}
