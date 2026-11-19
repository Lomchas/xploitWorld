export type WebMode = "menu" | "story" | "pvp";

const mode = import.meta.env.MODE;
export const webMode: WebMode =
  mode === "pvp" || mode === "story" ? mode : "menu";
const preview =
  window.location.port === "4173" ||
  window.location.port === "4174" ||
  window.location.port === "4175";
const origins: Record<WebMode, string> = {
  menu:
    import.meta.env.VITE_MENU_ORIGIN ||
    "http://127.0.0.1:" + (preview ? 4173 : 5173),
  story:
    import.meta.env.VITE_STORY_ORIGIN ||
    "http://historia.localhost:" + (preview ? 4174 : 5174),
  pvp:
    import.meta.env.VITE_PVP_ORIGIN ||
    "http://pvp.localhost:" + (preview ? 4175 : 5175),
};
export function worldUrl(target: WebMode, path = "/"): string {
  const url = new URL(path, origins[target]);
  if (target !== webMode) {
    try {
      const language = localStorage.getItem("xploitworld.language");
      if (language === "es" || language === "en")
        url.searchParams.set("lang", language);
      const saved = JSON.parse(
        localStorage.getItem("xploitworld.terminal") || "{}",
      );
      if (typeof saved.theme === "string")
        url.searchParams.set("theme", saved.theme);
      if (
        saved.cursor === "block" ||
        saved.cursor === "bar" ||
        saved.cursor === "underline"
      )
        url.searchParams.set("cursor", saved.cursor);
      if (typeof saved.blink === "boolean")
        url.searchParams.set("blink", String(saved.blink));
      const font = localStorage.getItem("nullprotocol.fontSize");
      if (font && ["12", "14", "16", "18"].includes(font))
        url.searchParams.set("font", font);
    } catch {
      // Navigation is still available with local preferences blocked.
    }
  }
  return url.toString();
}

export function applyIncomingPreferences(): void {
  const url = new URL(window.location.href);
  const locale = url.searchParams.get("lang");
  const theme = url.searchParams.get("theme");
  const cursor = url.searchParams.get("cursor");
  const blink = url.searchParams.get("blink");
  const font = url.searchParams.get("font");
  try {
    if (locale === "es" || locale === "en")
      localStorage.setItem("xploitworld.language", locale);
    if (font && ["12", "14", "16", "18"].includes(font))
      localStorage.setItem("nullprotocol.fontSize", font);
    if (theme || cursor || blink) {
      const current = JSON.parse(
        localStorage.getItem("xploitworld.terminal") || "{}",
      );
      if (
        theme &&
        ["phosphor", "amber", "ultraviolet", "slate", "contrast"].includes(
          theme,
        )
      )
        current.theme = theme;
      if (cursor === "block" || cursor === "bar" || cursor === "underline")
        current.cursor = cursor;
      if (blink === "true" || blink === "false")
        current.blink = blink === "true";
      localStorage.setItem("xploitworld.terminal", JSON.stringify(current));
    }
  } catch {
    // Defaults also work in a private tab.
  }
  for (const name of ["lang", "theme", "cursor", "blink", "font"])
    url.searchParams.delete(name);
  if (url.href !== window.location.href)
    window.history.replaceState(window.history.state, "", url);
}
