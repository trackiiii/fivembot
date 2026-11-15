export type ModoCarteira = "sandbox" | "live";

export function modoCarteira(): ModoCarteira {
  return process.env.LINHABANK_MODO?.trim() === "live" ? "live" : "sandbox";
}

export function emSandbox(): boolean {
  return modoCarteira() === "sandbox";
}

export function chatsAdmin(): string[] {
  return (process.env.LINHABANK_ADMIN_CHATS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function ehAdmin(chatId: string): boolean {
  return chatsAdmin().includes(chatId);
}
