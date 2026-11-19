import { translator, type Translator } from "../locales";

export function formatCommandTable(
  rows: readonly (readonly [command: string, description: string])[],
  t: Translator = translator("es"),
): string {
  const width = Math.max(7, ...rows.map(([command]) => command.length));
  return [
    t("COMANDO").padEnd(width) + " │ " + t("DESCRIPCIÓN"),
    "─".repeat(width + 1) + "┼" + "─".repeat(26),
    ...rows.map(
      ([command, description]) => command.padEnd(width) + " │ " + description,
    ),
  ].join("\n");
}
