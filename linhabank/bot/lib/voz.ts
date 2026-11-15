import { spawn, spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LIMITE_FALA = 500;
const VOZ_HUMANA = "pt-BR-FranciscaNeural";
const MBROLA_BR4 = "/usr/share/mbrola/br4/br4";
let python: string | undefined;
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

export function prepararFala(texto: string): string {
  return texto
    .replace(/\bThialinha\b/gi, "Tia linha")
    .replace(/\bLinhaBank\b/gi, "Linha Bank")
    .replace(/\bLBcoins\b/gi, "ele bê coins")
    .replace(/\s+/g, " ")
    .trim();
}

export function vozDisponivel(): boolean {
  garantirBins();
  return ffmpeg !== undefined && (python !== undefined || espeak !== undefined);
}

export async function sintetizarVoz(texto: string): Promise<Uint8Array | undefined> {
  const fala = textoParaFala(texto);
  if (fala === undefined) return undefined;
  garantirBins();
  if (ffmpeg === undefined) return undefined;
  const preparado = prepararFala(fala);
  if (python !== undefined) return sintetizarHumana(preparado);
  return sintetizarEspeak(preparado);
}

async function sintetizarHumana(fala: string): Promise<Uint8Array | undefined> {
  if (python === undefined || ffmpeg === undefined) return undefined;
  const pasta = await mkdtemp(join(tmpdir(), "linhabank-voz-"));
  const mp3 = join(pasta, "fala.mp3");
  const ogg = join(pasta, "fala.ogg");
  try {
    const gerou = await rodar(
      python,
      ["-m", "edge_tts", "--voice", VOZ_HUMANA, "--rate=+4%", "--pitch=+0Hz", `--text=${fala}`, "--write-media", mp3],
      15000,
    );
    if (gerou !== 0) return undefined;
    const bruto = await readFile(mp3);
    if (bruto.length < 800) return undefined;
    return await converterOpus(mp3, ogg);
  } catch {
    return undefined;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

async function sintetizarEspeak(fala: string): Promise<Uint8Array | undefined> {
  if (espeak === undefined || ffmpeg === undefined) return undefined;
  const pasta = await mkdtemp(join(tmpdir(), "linhabank-voz-"));
  const wav = join(pasta, "fala.wav");
  const ogg = join(pasta, "fala.ogg");
  try {
    const gerou = await rodar(espeak, ["-b", "1", ...perfilEspeak(), "-w", wav, fala], 12000);
    if (gerou !== 0) return undefined;
    return await converterOpus(wav, ogg);
  } catch {
    return undefined;
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

async function converterOpus(origem: string, ogg: string): Promise<Uint8Array | undefined> {
  if (ffmpeg === undefined) return undefined;
  const converteu = await rodar(
    ffmpeg,
    ["-y", "-i", origem, "-ar", "48000", "-ac", "1", "-c:a", "libopus", "-b:a", "48k", "-vbr", "on", "-application", "audio", ogg],
    12000,
  );
  if (converteu !== 0) return undefined;
  const audio = await readFile(ogg);
  return audio.length > 400 ? audio : undefined;
}

function perfilEspeak(): string[] {
  if (arquivoExiste(MBROLA_BR4) && comandoExiste("mbrola") !== undefined) {
    return ["-v", "mb-br4", "-s", "145", "-g", "4", "-p", "48", "-a", "130"];
  }
  return ["-v", "pt-br", "-s", "140", "-g", "4", "-p", "44", "-a", "130"];
}

function garantirBins(): void {
  if (binsChecados) return;
  binsChecados = true;
  ffmpeg = comandoExiste("ffmpeg");
  python = pythonComEdge();
  espeak = comandoExiste("espeak-ng") ?? comandoExiste("espeak");
}

function pythonComEdge(): string | undefined {
  const caminho = comandoExiste("python3") ?? comandoExiste("python");
  if (caminho === undefined) return undefined;
  const probe = spawnSync(caminho, ["-c", "import edge_tts"], { stdio: "ignore", timeout: 8000 });
  return probe.status === 0 ? caminho : undefined;
}

function arquivoExiste(caminho: string): boolean {
  try {
    accessSync(caminho, constants.R_OK);
    return true;
  } catch {
    return false;
  }
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
