import {
  arenaNodes,
  isPvpRegionId,
  languageTag,
  PVP_REGIONS,
  type AtlasContinent,
  type CapitalRole,
  type Locale,
  type PvpRegion,
  type PvpRegionId,
} from "@null-protocol/shared";

export const continents: Record<AtlasContinent, string> = {
  NA: "Norteamérica, Centroamérica y Caribe",
  SA: "Sudamérica",
  EU: "Europa",
  AF: "África",
  AS: "Asia",
  OC: "Oceanía",
};
export const roles: Record<CapitalRole, string> = {
  capital: "Capital nacional",
  federal: "Ciudad federal",
  declared: "Capital declarada",
  deFacto: "Sede de facto",
  constitutional: "Capital constitucional",
  administrative: "Sede administrativa",
  executive: "Sede ejecutiva",
  legislative: "Sede legislativa",
  judicial: "Sede judicial",
  government: "Sede de gobierno",
  royal: "Sede real y legislativa",
  economic: "Capital económica",
  claimed: "Capital reivindicada",
  interim: "Sede provisional",
};
export const profiles = {
  local: "Acceso local",
  regional: "Enlace regional",
  hub: "Interconexión troncal",
} as const;

export function countryNames(locale: Locale) {
  const display = new Intl.DisplayNames([languageTag(locale)], {
    type: "region",
  });
  const names: Record<string, string> = {
    XK: "Kosovo",
    TW: locale === "es" ? "Taiwán" : "Taiwan",
  };
  return (id: string) => names[id] ?? display.of(id) ?? id;
}
export const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

export function clockText(epoch: number, timeZone: string, locale: Locale) {
  const format = new Intl.DateTimeFormat(languageTag(locale), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const offset = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(epoch)
    .find((part) => part.type === "timeZoneName")
    ?.value.replace("GMT", "UTC");
  return { time: format.format(epoch), offset: offset || "UTC" };
}
export function preferredArena() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (
      PVP_REGIONS.find((region) => region.site?.timeZone === zone)?.id ??
      "bogota"
    );
  } catch {
    return "bogota";
  }
}
export const locationOf = (region: PvpRegion) => arenaNodes(region.id)[0]!;

export function readFavorites(): PvpRegionId[] {
  try {
    const ids: unknown = JSON.parse(
      localStorage.getItem("xwd.atlas.favorites") || "[]",
    );
    return Array.isArray(ids) ? [...new Set(ids.filter(isPvpRegionId))] : [];
  } catch {
    return [];
  }
}

export function storeFavorites(ids: PvpRegionId[]) {
  try {
    localStorage.setItem("xwd.atlas.favorites", JSON.stringify(ids));
  } catch {
    // Favorites still work in the current tab.
  }
}
