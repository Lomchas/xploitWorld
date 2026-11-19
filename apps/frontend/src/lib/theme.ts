export const xtermTheme = {
  background: "#0c0c0b",
  foreground: "#ececea",
  cursor: "#dac278",
  cursorAccent: "#0c0c0b",
  selectionBackground: "rgba(218, 194, 120, 0.3)",
  black: "#0c0c0b",
  red: "#b66f68",
  green: "#73b98a",
  yellow: "#dac278",
  blue: "#4d9bb5",
  magenta: "#ba9c60",
  cyan: "#7190af",
  white: "#ececea",
  brightBlack: "#89877f",
  brightRed: "#c98a83",
  brightGreen: "#94c7a3",
  brightYellow: "#e8d690",
  brightBlue: "#6cb3c9",
  brightMagenta: "#cab577",
  brightCyan: "#8aa9c4",
  brightWhite: "#f5f4f3",
};

export const workstationTerminalTheme = {
  ...xtermTheme,
  background: "#010b05",
  foreground: "#ceffdf",
  cursor: "#39ff72",
  cursorAccent: "#010b05",
  selectionBackground: "#23603a",
  black: "#010b05",
  green: "#4eed86",
  yellow: "#ffd065",
  cyan: "#93e6c1",
  brightGreen: "#87ffab",
  brightYellow: "#ffe089",
  brightCyan: "#b3ffda",
};

export const terminalFontStack =
  "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'Liberation Mono', 'DejaVu Sans Mono', monospace";

export const TERMINAL_FONT_SIZE_DESKTOP = 16;
export const TERMINAL_FONT_SIZE_MOBILE = 12;
export const TERMINAL_LINE_HEIGHT = 1.2;

import type { GameTheme } from "./preferences";

export const terminalThemes: Record<GameTheme, typeof xtermTheme> = {
  phosphor: workstationTerminalTheme,
  amber: {
    ...xtermTheme,
    background: "#120b04",
    foreground: "#ffe8bf",
    cursor: "#ffbd65",
    cursorAccent: "#120b04",
    selectionBackground: "#684719",
    black: "#120b04",
    green: "#b3d990",
    yellow: "#ffbd65",
    cyan: "#f5d6a4",
  },
  ultraviolet: {
    ...xtermTheme,
    background: "#100919",
    foreground: "#f1e7ff",
    cursor: "#d6a9ff",
    cursorAccent: "#100919",
    selectionBackground: "#533575",
    black: "#100919",
    green: "#a6e8d1",
    yellow: "#f7c886",
    cyan: "#d6b7ff",
  },
  slate: {
    ...xtermTheme,
    background: "#0e161e",
    foreground: "#e8eff7",
    cursor: "#a5caed",
    cursorAccent: "#0e161e",
    selectionBackground: "#365673",
    black: "#0e161e",
    cyan: "#a5caed",
  },
  contrast: {
    ...xtermTheme,
    background: "#000000",
    foreground: "#ffffff",
    cursor: "#fff078",
    cursorAccent: "#000000",
    selectionBackground: "#414b74",
    black: "#000000",
    red: "#ff9898",
    green: "#8cffad",
    cyan: "#aeeeff",
    yellow: "#fff078",
    brightBlack: "#bbbbbb",
  },
};
