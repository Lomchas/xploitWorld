import { TERMINAL_FONT_SIZE_DESKTOP, TERMINAL_FONT_SIZE_MOBILE } from "./theme";

export function readFontSize(): number {
  try {
    const value = Number(localStorage.getItem("nullprotocol.fontSize"));
    if ([12, 14, 16, 18].includes(value)) return value;
  } catch {
    // Use the device default.
  }
  return window.matchMedia?.("(max-width: 640px)").matches
    ? TERMINAL_FONT_SIZE_MOBILE
    : TERMINAL_FONT_SIZE_DESKTOP;
}

export function saveFontSize(value: number): void {
  try {
    localStorage.setItem("nullprotocol.fontSize", String(value));
  } catch {
    // The current form still applies the preference.
  }
}

export const GAME_THEMES = [
  "phosphor",
  "amber",
  "ultraviolet",
  "slate",
  "contrast",
] as const;
export type GameTheme = (typeof GAME_THEMES)[number];
export function isGameTheme(value: unknown): value is GameTheme {
  return GAME_THEMES.some((theme) => theme === value);
}

export interface TerminalPreferences {
  theme: GameTheme;
  cursor: "block" | "bar" | "underline";
  blink: boolean;
}

export function readTerminalPreferences(): TerminalPreferences {
  const fallback: TerminalPreferences = {
    theme: "phosphor",
    cursor: "block",
    blink: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  };
  try {
    const saved = JSON.parse(
      localStorage.getItem("xploitworld.terminal") ?? "null",
    ) as (Partial<TerminalPreferences> & { palette?: string }) | null;
    return {
      theme: isGameTheme(saved?.theme)
        ? saved.theme
        : saved?.palette === "original"
          ? "slate"
          : fallback.theme,
      cursor:
        saved?.cursor === "bar" || saved?.cursor === "underline"
          ? saved.cursor
          : "block",
      blink: typeof saved?.blink === "boolean" ? saved.blink : fallback.blink,
    };
  } catch {
    return fallback;
  }
}

export function saveTerminalPreferences(value: TerminalPreferences): void {
  try {
    localStorage.setItem("xploitworld.terminal", JSON.stringify(value));
  } catch {
    // Apply the preference to the current page anyway.
  }
  applyGameTheme(value.theme);
}

export function applyGameTheme(theme: GameTheme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-primary")
        .trim(),
    );
}
