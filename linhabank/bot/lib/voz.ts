import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIMITE_FALA = 500;
let espeak: string | undefined;
let ffmpeg: string | undefined;
let binsChecados = false;

export function textoParaFala(texto: string): string | undefined {
  const limpo = texto
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/^\uFEFF/, "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/R\$\s*(\d{1,7})(?:[.,](\d{2}))?/gi, (_tudo, reais: string, cents?: string) => {
      if (cents !== undefined && cents !== "00") return `${reais} reais e ${Number(cents)} centavos`;
      return `${reais} reais`;
    })
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^thialinha\s*:\s*/i, "")
    .trim();
  if (limpo.length < 2) return undefined;
  if (/000201|br\.gov\.bcb\.pix/i.test(limpo)) return undefined;
  return limpo.length > LIMITE_FALA ? `${limpo.slice(0, LIMITE_FALA - 1)}…` : limpo;
}

export function vozDisponivel(): boolean {
  garantirBins();
  return espeak !== undefined && ffmpeg !== undefined;
}

export async function sintetizarVoz(texto: string): Promise<Uint8Array | undefined> {
  const fala = textoParaFala(texto);
  if (fala === undefined) return undefined;
  garantirBins();
  if (espeak === undefined || ffmpeg === undefined) return undefined;
  const pasta = await mkdtemp(join(tmpdir(), "linhabank-voz-"));
  const wav = join(pasta, "fala.wav");
  const ogg = join(pasta, "fala.ogg");
  try {
    const gerou = await rodar(espeak, ["-v", "pt-br+f3", "-s", "148", "-p", "52", "-w", wav, fala], 8000);
    if (gerou !== 0) return undefined;
    const converteu = await rodar(
      ffmpeg,
      ["-y", "-i", wav, "-c:a", "libopus", "-b:a", "24k", "-vbr", "on", "-application", "voip", ogg],
      8000,
    );
    if (converteu !== 0) return undefined;
    return await readFile(ogg);
  } catch {
    return undefined;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

function garantirBins(): void {
  if (binsChecados) return;
  binsChecados = true;
  espeak = comandoExiste("espeak-ng") ?? comandoExiste("espeak");
  ffmpeg = comandoExiste("ffmpeg");
}

function comandoExiste(nome: string): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir.length === 0) continue;
    try {
      const candidato = join(dir, nome);
      accessSync(candidato, constants.X_OK);
      return candidato;
    } catch {
      continue;
    }
  }
  return undefined;
}

function rodar(cmd: string, args: string[], timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("timeout"));
    }, timeoutMs);
    child.on("error", (erro) => {
      clearTimeout(timer);
      reject(erro);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}
