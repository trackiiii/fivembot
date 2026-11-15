import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let cache: string | undefined;

export function htmlMiniApp(): string {
  if (cache === undefined) {
    cache = readFileSync(fileURLToPath(new URL("./pagina.html", import.meta.url)), "utf8");
  }
  return cache;
}
