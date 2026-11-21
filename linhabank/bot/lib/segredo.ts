import { timingSafeEqual } from "node:crypto";

export function tokenConfere(recebido: string, esperado: string): boolean {
  if (recebido.length === 0 || esperado.length === 0) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function autorizarRotaPix(request: Request, rota: "recebido" | "asaas"): boolean {
  const gatewayHeader = (request.headers.get("x-linhabank-gateway-token") ?? "").trim();
  const asaasHeader = (request.headers.get("asaas-access-token") ?? "").trim();
  const gatewaySecret = (process.env.PIX_GATEWAY_WEBHOOK_SECRET ?? "").trim();
  const asaasSecret = (process.env.ASAAS_WEBHOOK_TOKEN ?? "").trim();
  if (rota === "recebido") {
    if (gatewaySecret.length >= 8) return tokenConfere(gatewayHeader, gatewaySecret);
    if (asaasSecret.length >= 8 && asaasHeader.length > 0) return false;
    return true;
  }
  if (asaasSecret.length >= 8) return tokenConfere(asaasHeader, asaasSecret);
  if (gatewaySecret.length >= 8 && gatewayHeader.length > 0) return false;
  return true;
}

export function pedidoConfigHttp(pedido: unknown): Record<string, unknown> {
  if (pedido === null || typeof pedido !== "object" || Array.isArray(pedido)) return {};
  const { modo: _modo, chatsAdmin: _admins, ...resto } = pedido as Record<string, unknown>;
  return resto;
}
