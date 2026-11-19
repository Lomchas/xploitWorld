import capitals from "./capitals.json";

export type AtlasContinent = "NA" | "SA" | "EU" | "AF" | "AS" | "OC";
export type CityArenaId = `cap-${string}`;
export type CapitalRole =
  | "capital"
  | "federal"
  | "declared"
  | "deFacto"
  | "constitutional"
  | "administrative"
  | "executive"
  | "legislative"
  | "judicial"
  | "government"
  | "royal"
  | "economic"
  | "claimed"
  | "interim";
export type ArenaTier = "local" | "regional" | "hub";

export interface AtlasSite {
  id: CityArenaId | "bogota" | "tokio";
  country: string;
  continent: AtlasContinent;
  name: string;
  english: string;
  lon: number;
  lat: number;
  timeZone: string;
  langs: readonly string[];
  role: CapitalRole;
  tier: ArenaTier;
  network: number;
}

export const ATLAS_SITES = capitals as readonly AtlasSite[];

export const ARENA_PROFILES = {
  local: { capacity: 48, linkLimit: 6, accessMs: 8 },
  regional: { capacity: 96, linkLimit: 9, accessMs: 5 },
  hub: { capacity: 160, linkLimit: 12, accessMs: 3 },
} as const satisfies Record<
  ArenaTier,
  { capacity: number; linkLimit: number; accessMs: number }
>;

export function atlasRoute(
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
  accessMs: number,
) {
  const radians = Math.PI / 180;
  const latitude = (to.lat - from.lat) * radians;
  const longitude = (to.lon - from.lon) * radians;
  const a =
    Math.sin(latitude / 2) ** 2 +
    Math.cos(from.lat * radians) *
      Math.cos(to.lat * radians) *
      Math.sin(longitude / 2) ** 2;
  const km = 2 * 6371.0088 * Math.asin(Math.sqrt(Math.min(1, a)));
  // Round-trip propagation at ~200,000 km/s in fiber plus the
  // published game routing allowance and access cost of both arenas.
  return { km: Math.round(km), rtt: Math.round(km * 0.0125 + accessMs) };
}
