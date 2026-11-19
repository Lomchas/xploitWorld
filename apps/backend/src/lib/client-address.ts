import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

const normalize = (value: string): string =>
  value.replace(/^::ffff:/i, "").toLowerCase();

export function proxyTrust(
  addresses: readonly string[],
): (address: string, index: number) => boolean {
  const allowed = new Set(addresses.map(normalize));
  return (address, index) => index === 0 && allowed.has(normalize(address));
}
export function readProxyIps(value: string): string[] {
  const addresses = value
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (addresses.some((address) => !isIP(address)))
    throw new Error("TRUST_PROXY_IPS admite direcciones IP literales.");
  return addresses;
}
export function clientAddress(
  request: {
    headers: IncomingMessage["headers"];
    socket: Pick<IncomingMessage["socket"], "remoteAddress">;
  },
  trustedProxyIps: readonly string[],
): string {
  const peer = request.socket.remoteAddress ?? "unknown";
  if (!proxyTrust(trustedProxyIps)(peer, 0)) return normalize(peer);
  const header = request.headers["x-forwarded-for"];
  const address =
    typeof header === "string" ? header.split(",").at(-1)?.trim() : undefined;
  return address && isIP(address) ? normalize(address) : normalize(peer);
}
