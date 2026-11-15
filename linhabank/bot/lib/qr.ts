import qrcode from "qrcode";

export async function pngCopiaECola(copiaECola: string): Promise<Uint8Array> {
  const buffer = await qrcode.toBuffer(copiaECola, {
    type: "png",
    margin: 1,
    width: 420,
    errorCorrectionLevel: "M",
  });
  return new Uint8Array(buffer);
}
