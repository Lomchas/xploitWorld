import { randomInt } from "node:crypto";
import {
  normalizeAddress,
  PVP_ENERGY_INTERVAL_MS,
  PVP_MAX_ENERGY,
  PVP_PORTS,
  pvpRegion,
  PVP_SERVICES,
  type PvpDeviceConfig,
  type PvpFlow,
  type PvpPortObservation,
  type PvpProtocol,
  type PvpRegionId,
  type PvpServiceId,
} from "@null-protocol/shared";

export interface VirtualHost {
  id: string;
  address: string;
  integrity: number;
  config: PvpDeviceConfig;
}
interface ObservedPort {
  observation: PvpPortObservation;
  service: PvpServiceId | "tunnel" | null;
  encryption: PvpFlow["encryption"];
  reason?: string;
}
export const freshDevice = (): PvpDeviceConfig => ({
  tools: [],
  services: {
    web: { open: true, patched: false },
    admin: { open: true, patched: false },
    dns: { open: true, patched: false },
  },
  policy: "allow",
  rules: [],
  tls: false,
  vpn: false,
  trustedPeers: [],
  isolated: false,
});

export function virtualAddress(regionId: PvpRegionId, number: number): string {
  const region = pvpRegion(regionId).network;
  const high = Math.floor(number / 65536);
  const low = (number % 65536).toString(16);
  return `2001:db8:${region}::${high ? high.toString(16) + ":" : ""}${low}`;
}
export function virtualIpv4(number: number): string | null {
  if (number < 1 || number > 0xfffffe) return null;
  return [10, number >>> 16, (number >>> 8) & 255, number & 255].join(".");
}
export function addressNumber(
  regionId: PvpRegionId,
  address: string,
): number | undefined {
  const normalized = normalizeAddress(address);
  if (!normalized) return undefined;
  if (normalized.startsWith("10.")) {
    const number = normalized
      .split(".")
      .slice(1)
      .reduce((total, part) => total * 256 + Number(part), 0);
    return virtualIpv4(number) === normalized ? number : undefined;
  }
  const region = pvpRegion(regionId).network;
  const prefix = `2001:db8:${region}::`;
  if (!normalized.startsWith(prefix)) return undefined;
  const suffix = normalized.slice(prefix.length);
  if (!/^(?:[0-9a-f]{1,4}:)?[0-9a-f]{1,4}$/.test(suffix)) return undefined;
  const value = suffix
    .split(":")
    .reduce((total, part) => total * 65536 + Number.parseInt(part, 16), 0);
  return value > 0 && value <= 2_147_483_647 ? value : undefined;
}
export function energyNow(energy: number, energyAt: Date, now: Date): number {
  const elapsed = Math.max(0, now.getTime() - energyAt.getTime());
  return Math.min(
    PVP_MAX_ENERGY,
    energy + Math.floor(elapsed / PVP_ENERGY_INTERVAL_MS),
  );
}
function drops(
  config: PvpDeviceConfig,
  sourceId: string,
  protocol: PvpProtocol,
  port: number,
): boolean {
  if (!config.tools.includes("firewall")) return false;
  const matched = config.rules.find(
    (rule) =>
      (rule.sourceId === null || rule.sourceId === sourceId) &&
      (rule.protocol === "any" || rule.protocol === protocol) &&
      (rule.port === null || rule.port === port),
  );
  return (matched?.action ?? config.policy) === "drop";
}
export function inspectPort(
  source: VirtualHost,
  target: VirtualHost,
  protocol: PvpProtocol,
  port: number,
  now = new Date(),
): ObservedPort {
  const hidden = (state: "closed" | "filtered"): ObservedPort => ({
    observation: { protocol, port, state },
    service: null,
    encryption: "none",
  });
  if (
    source.config.isolated ||
    source.integrity === 0 ||
    target.config.isolated ||
    target.integrity === 0 ||
    drops(target.config, source.id, protocol, port)
  ) {
    return hidden("filtered");
  }
  const mutualTunnel =
    source.config.vpn &&
    target.config.vpn &&
    source.config.trustedPeers.includes(target.id) &&
    target.config.trustedPeers.includes(source.id);
  if (protocol === "udp" && port === 51820 && target.config.vpn) {
    if (!mutualTunnel) return hidden("filtered");
    return {
      observation: { protocol, port, state: "open", banner: "Túnel / NullVPN" },
      service: "tunnel",
      encryption: "vpn",
    };
  }
  for (const id of ["web", "admin", "dns"] as const) {
    const service = PVP_SERVICES[id];
    const effectivePort =
      id === "web" && target.config.tls ? 443 : service.port;
    if (
      service.protocol !== protocol ||
      effectivePort !== port ||
      !target.config.services[id].open
    )
      continue;
    const restartUntil = target.config.services[id].restartUntil;
    if (restartUntil && Date.parse(restartUntil) > now.getTime())
      return {
        ...hidden("closed"),
        reason: "Servicio en reinicio tras aplicar el parche.",
      };
    if (
      id === "admin" &&
      target.config.vpn &&
      (!mutualTunnel || drops(target.config, source.id, "udp", 51820))
    )
      return hidden("filtered");
    const encryption =
      id === "admin" && target.config.vpn
        ? "vpn"
        : id === "web" && target.config.tls
          ? "tls"
          : "none";
    const version = target.config.services[id].patched ? "1.1" : "1.0";
    const name =
      id === "web" && target.config.tls ? "Portal HTTPS" : service.name;
    return {
      observation: {
        protocol,
        port,
        state: "open",
        banner: `${name} / NullOS ${version}`,
      },
      service: id,
      encryption,
    };
  }
  return hidden("closed");
}
export function traceFlow(
  source: VirtualHost,
  target: VirtualHost,
  observed: ObservedPort,
): PvpFlow {
  const { protocol, port, state } = observed.observation;
  const encryption = observed.encryption;
  const trace = protocol === "tcp" ? ["SYN"] : ["Datagrama UDP"];
  if (state === "filtered")
    trace.push("Sin respuesta dentro de la ventana simulada");
  else if (state === "closed")
    trace.push(protocol === "tcp" ? "RST" : "ICMPv6: puerto inaccesible");
  else {
    if (protocol === "tcp") trace.push("SYN-ACK", "ACK");
    if (encryption !== "none")
      trace.push(`${encryption.toUpperCase()}: datos cifrados`);
    else trace.push("Respuesta de aplicación virtual");
  }
  return {
    source: source.address,
    destination: target.address,
    sourcePort: randomInt(49152, 65536),
    protocol,
    port,
    state,
    encryption,
    trace,
  };
}
export function scanHost(source: VirtualHost, target: VirtualHost, now?: Date) {
  const observed = PVP_PORTS.map(({ protocol, port }) =>
    inspectPort(source, target, protocol, port, now),
  );
  return {
    ports: observed.map((result) => result.observation),
    flows: observed.map((result) => traceFlow(source, target, result)),
  };
}

const DAMAGE: Record<PvpServiceId, number> = { web: 34, admin: 38, dns: 24 };
export function probeHost(
  source: VirtualHost,
  target: VirtualHost,
  protocol: PvpProtocol,
  port: number,
  now?: Date,
) {
  const observed = inspectPort(source, target, protocol, port, now);
  const { service } = observed;
  const flow = traceFlow(source, target, observed);
  if (!service || service === "tunnel") {
    return { flow, service: null, damage: 0, patched: false };
  }
  const patched = target.config.services[service].patched;
  return {
    flow,
    service,
    patched,
    damage: patched ? 0 : Math.min(DAMAGE[service], target.integrity),
  };
}
