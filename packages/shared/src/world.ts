import {
  pvpRegion,
  type LegacyRegionId,
  type PvpRegionId,
} from "./pvp/catalog";

export const WORLD_NODES = {
  na: [
    { name: "Nueva York", country: "US", lon: -74, lat: 40.7 },
    { name: "Vancouver", country: "CA", lon: -123.1, lat: 49.3 },
    { name: "Monterrey", country: "MX", lon: -100.3, lat: 25.7 },
  ],
  eu: [
    { name: "Frankfurt", country: "DE", lon: 8.7, lat: 50.1 },
    { name: "Madrid", country: "ES", lon: -3.7, lat: 40.4 },
    { name: "Estocolmo", country: "SE", lon: 18.1, lat: 59.3 },
  ],
  as: [
    { name: "Singapur", country: "SG", lon: 103.8, lat: 1.4 },
    { name: "Bombay", country: "IN", lon: 72.9, lat: 19.1 },
  ],
  sa: [
    { name: "São Paulo", country: "BR", lon: -46.6, lat: -23.5 },
    { name: "Santiago", country: "CL", lon: -70.7, lat: -33.5 },
  ],
  af: [
    { name: "Nairobi", country: "KE", lon: 36.8, lat: -1.3 },
    { name: "Lagos", country: "NG", lon: 3.4, lat: 6.5 },
    { name: "Ciudad del Cabo", country: "ZA", lon: 18.4, lat: -33.9 },
  ],
  bogota: [{ name: "Bogotá", country: "CO", lon: -74.1, lat: 4.7 }],
  tokio: [{ name: "Tokio", country: "JP", lon: 139.7, lat: 35.7 }],
} as const satisfies Record<
  LegacyRegionId,
  readonly {
    name: string;
    country: string;
    lon: number;
    lat: number;
  }[]
>;

/** Historical multi-node arenas keep the same signal index mapping. */
export function arenaNodes(id: PvpRegionId): readonly {
  name: string;
  country: string;
  lon: number;
  lat: number;
}[] {
  const region = pvpRegion(id);
  if (region.site) return [region.site];
  return WORLD_NODES[id as LegacyRegionId];
}

export type SignalKind = "SCAN" | "PROBE" | "COMPROMISE" | "LINK";
export interface WorldState {
  generatedAt: string;
  scope?: PvpRegionId;
  regions: {
    id: PvpRegionId;
    devices: number;
    online: number;
    activity: number;
  }[];
  series: {
    hour: string;
    scans: number;
    probes: number;
    compromises: number;
    links: number;
  }[];
  signals: {
    id: string;
    region: PvpRegionId;
    from: number;
    to: number;
    kind: SignalKind;
    createdAt: string;
  }[];
  ranking: {
    alias: string;
    region: PvpRegionId;
    score: number;
    compromises: number;
  }[];
}
