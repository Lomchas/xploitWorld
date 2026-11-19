import {
  ARENA_PROFILES,
  ATLAS_SITES,
  type AtlasContinent,
  type AtlasSite,
  type CityArenaId,
} from "./atlas";

export type LegacyRegionId =
  "na" | "eu" | "as" | "sa" | "af" | "bogota" | "tokio";
export type PvpRegionId = LegacyRegionId | CityArenaId;
export interface PvpRegion {
  id: PvpRegionId;
  name: string;
  continent: AtlasContinent;
  description: string;
  network: string;
  capacity?: number;
  linkLimit: number;
  accessMs: number;
  site?: AtlasSite;
}

const legacyRegions = [
  {
    id: "na",
    name: "Norteamérica",
    continent: "NA",
    network: "1",
    description: "Arena abierta de Norteamérica.",
  },
  {
    id: "eu",
    name: "Europa",
    continent: "EU",
    network: "2",
    description: "Arena abierta de Europa.",
  },
  {
    id: "as",
    name: "Asia",
    continent: "AS",
    network: "3",
    description: "Arena abierta de Asia.",
  },
  {
    id: "sa",
    name: "Sudamérica",
    continent: "SA",
    network: "4",
    description: "Arena abierta de Sudamérica.",
  },
  {
    id: "af",
    name: "África",
    continent: "AF",
    network: "5",
    description: "Arena abierta de África.",
  },
  {
    id: "bogota",
    name: "Bogotá",
    continent: "SA",
    network: "6",
    description: "Arena de capital",
    capacity: 128,
  },
  {
    id: "tokio",
    name: "Tokio",
    continent: "AS",
    network: "7",
    description: "Arena de capital",
    capacity: 128,
  },
] as const;

export const PVP_REGIONS: readonly PvpRegion[] = /* @__PURE__ */ (() => {
  const legacy: PvpRegion[] = legacyRegions.map((region) => {
    const site = ATLAS_SITES.find(({ id }) => id === region.id);
    return { linkLimit: 12, accessMs: 4, ...region, ...(site ? { site } : {}) };
  });
  const cities = ATLAS_SITES.filter(
    ({ id }) => id !== "bogota" && id !== "tokio",
  ).map((site): PvpRegion => ({
    id: site.id,
    name: site.name,
    continent: site.continent,
    site,
    description: "Arena de capital",
    network: site.network.toString(16),
    ...ARENA_PROFILES[site.tier],
  }));
  return [...legacy, ...cities];
})();
const regionsById = /* @__PURE__ */ (() =>
  new Map(PVP_REGIONS.map((region) => [region.id, region])))();

export const pvpRegion = (id: PvpRegionId) => regionsById.get(id)!;
export function isPvpRegionId(value: unknown): value is PvpRegionId {
  return typeof value === "string" && regionsById.has(value as PvpRegionId);
}

export const PVP_SERVICES = {
  web: { name: "Portal web", protocol: "tcp", port: 80 },
  admin: { name: "Administración", protocol: "tcp", port: 22 },
  dns: { name: "Resolución DNS", protocol: "udp", port: 53 },
} as const;

export type PvpServiceId = keyof typeof PVP_SERVICES;
export type PvpProtocol = "tcp" | "udp";
export function isPvpProtocol(value: unknown): value is PvpProtocol {
  return value === "tcp" || value === "udp";
}
export function isPvpServiceId(value: unknown): value is PvpServiceId {
  return typeof value === "string" && Object.hasOwn(PVP_SERVICES, value);
}
export const PVP_PORTS = [
  { protocol: "tcp", port: 22 },
  { protocol: "tcp", port: 80 },
  { protocol: "tcp", port: 443 },
  { protocol: "udp", port: 53 },
  { protocol: "udp", port: 51820 },
] as const;

export const PVP_TOOLS = {
  firewall: {
    name: "Firewall",
    description:
      "Filtra conexiones nuevas por origen, protocolo y puerto. Ordena las reglas y aísla el equipo.",
  },
  ids: {
    name: "Sensor IDS",
    description:
      "Identifica firmas de ataques y revela el origen virtual para responder a un incidente.",
  },
  capture: {
    name: "Captura de tráfico",
    description:
      "Registra metadatos de flujos TCP y UDP, sus respuestas y el cifrado observado.",
  },
  tls: {
    name: "Módulo TLS",
    description:
      "Publica el portal por TCP/443 y cifra su contenido. Los parches de aplicación siguen siendo independientes.",
  },
  vpn: {
    name: "Túnel VPN",
    description:
      "Limita la administración a pares con confianza mutua mediante UDP/51820.",
  },
  analyzer: {
    name: "Laboratorio de análisis",
    description:
      "Desensambla muestras NPX sintéticas, verifica su hash e identifica la firma y el parche recomendado.",
  },
} as const;

export type PvpToolId = keyof typeof PVP_TOOLS;
export function isPvpToolId(value: unknown): value is PvpToolId {
  return typeof value === "string" && Object.hasOwn(PVP_TOOLS, value);
}

export const PVP_STARTER_BTC = 20;
export const PVP_STARTER_SATS = 2_000_000_000n;
export const PVP_MAX_ENERGY = 100;
export const PVP_ENERGY_INTERVAL_MS = 2_000;
export const PVP_ATTACK_COOLDOWN_MS = 3_000;
export const PVP_REPAIR_COOLDOWN_MS = 30_000;
export const PVP_SERVICE_RESTART_MS = 3_000;
export const PVP_EVIDENCE_TTL_MS = 5 * 60_000;
export const PVP_PRESENCE_MS = 45_000;
export const PVP_MAX_RULES = 12;
export const PVP_PAGE_SIZE = 24;
export const PVP_ENERGY_COST = {
  scan: 3,
  exploit: 12,
  counter: 14,
  install: 6,
  patch: 4,
  analyze: 4,
  repair: 15,
} as const;

export function formatPvpBtc(sats: string): string {
  const value = BigInt(sats);
  const amount = value < 0n ? -value : value;
  const whole = amount / 100_000_000n;
  const fractional = (amount % 100_000_000n)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  const magnitude = fractional
    ? whole.toString() + "." + fractional
    : whole.toString();
  return value < 0n ? "-" + magnitude : magnitude;
}
