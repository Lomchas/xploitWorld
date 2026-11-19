import { COMMAND_WHITELIST, type Locale } from "@null-protocol/shared";
const DICTIONARY = [
  ...new Set([
    ...COMMAND_WHITELIST,
    "levels",
    "status",
    "dossier",
    "listar_operaciones",
    "mission",
    "submit",
    "progress",
    "history",
  ]),
].sort();
const multiplayer = [
  "ack",
  "alerts",
  "analyze",
  "arenas",
  "base64",
  "block",
  "cat",
  "cd",
  "chmod",
  "clear",
  "echo",
  "find",
  "firewall",
  "grep",
  "head",
  "help",
  "history",
  "import",
  "isolate",
  "join",
  "ls",
  "mkdir",
  "open",
  "patch",
  "peers",
  "pkg",
  "pwd",
  "repair",
  "retry",
  "rm",
  "rmdir",
  "rules",
  "scan",
  "service",
  "sha256sum",
  "stat",
  "status",
  "tail",
  "tls",
  "touch",
  "tree",
  "trust",
  "vpn",
  "wc",
  "write",
];
export function autocomplete(
  currentBuffer: string,
  pvp = false,
  locale: Locale = "es",
): string[] {
  if (!currentBuffer || /\s/.test(currentBuffer)) return [];
  const hidden =
    locale === "en" ? ["certificado", "epilogo"] : ["certificate", "epilogue"];
  return (pvp ? multiplayer : DICTIONARY).filter(
    (command) => command.startsWith(currentBuffer) && !hidden.includes(command),
  );
}
