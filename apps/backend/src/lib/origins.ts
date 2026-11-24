export function readFrontendOrigins(value: string): string[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length)
    throw new Error(
      "FRONTEND_ORIGINS necesita al menos un origen HTTP o HTTPS.",
    );
  return [
    ...new Set(
      entries.map((entry) => {
        try {
          const url = new URL(entry);
          if (url.protocol === "http:" || url.protocol === "https:")
            return url.origin;
        } catch {
          // Report the setting without exposing its contents in startup logs.
        }
        throw new Error(
          "FRONTEND_ORIGINS contiene una dirección inválida. Revisa apps/backend/.env y .env.pvp o ejecuta pnpm config:lan con la IPv4 de tu equipo.",
        );
      }),
    ),
  ];
}
