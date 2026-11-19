import {
  isPvpRegionId,
  pvpRegion,
  type Locale,
  type PvpRegion,
  type Translator,
} from "@null-protocol/shared";

export function arenaName(region: PvpRegion, locale: Locale, t: Translator) {
  return region.site && locale === "en" ? region.site.english : t(region.name);
}

export function readSelectedServer(): PvpRegion | null {
  try {
    const id = localStorage.getItem("nullprotocol.server");
    return isPvpRegionId(id) ? pvpRegion(id) : null;
  } catch {
    return null;
  }
}
export function saveSelectedServer(server: PvpRegion): void {
  try {
    localStorage.setItem("nullprotocol.server", server.id);
  } catch {
    /* Selection remains available in the current page. */
  }
}
