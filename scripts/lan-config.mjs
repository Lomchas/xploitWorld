import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function usableAddress(value) {
  if (typeof value !== "string" || isIP(value) !== 4) return false;
  const first = Number(value.split(".")[0]);
  return first > 0 && first < 224 && first !== 127;
}

function validOrigins(value) {
  return value.split(",").flatMap((entry) => {
    try {
      const url = new URL(entry.trim());
      return url.protocol === "http:" || url.protocol === "https:"
        ? [url.origin]
        : [];
    } catch {
      return [];
    }
  });
}

export function developmentOrigins(value, mode, addresses) {
  if (mode !== "story" && mode !== "pvp")
    throw new Error("Selecciona story o pvp para configurar sus orígenes.");
  let localAddresses = addresses;
  if (!localAddresses) {
    try {
      localAddresses = Object.values(networkInterfaces())
        .flat()
        .filter((entry) => entry && !entry.internal && entry.family === "IPv4")
        .map((entry) => entry.address);
    } catch {
      localAddresses = [];
    }
  }
  const hosts = [
    "127.0.0.1",
    "localhost",
    mode === "story" ? "historia.localhost" : "pvp.localhost",
    ...localAddresses.filter(usableAddress),
  ];
  const ports = mode === "story" ? [5174, 4174] : [5175, 4175];
  return [
    ...new Set([
      ...validOrigins(value),
      ...hosts.flatMap((host) =>
        ports.map((port) => "http://" + host + ":" + port),
      ),
    ]),
  ].join(",");
}

function repair(ip) {
  if (!usableAddress(ip))
    throw new Error(
      "Indica una IPv4 LAN válida. Ejemplo: node XploitworlD_Reparar_LAN.mjs 192.168.40.103",
    );
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const root = [process.cwd(), resolve(scriptDirectory, "..")].find(
    (candidate) =>
      existsSync(resolve(candidate, "apps/backend/.env")) &&
      existsSync(resolve(candidate, "apps/backend/.env.pvp")),
  );
  if (!root)
    throw new Error("Ejecuta el reparador desde la carpeta null-protocol.");
  const updates = [
    ["story", "apps/backend/.env"],
    ["pvp", "apps/backend/.env.pvp"],
  ].map(([mode, relativePath]) => {
    const path = resolve(root, relativePath);
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/u, "");
    const pattern = /^FRONTEND_ORIGINS=([^\r\n]*)/gm;
    const value = [...text.matchAll(pattern)]
      .map((match) => match[1])
      .join(",");
    const setting = "FRONTEND_ORIGINS=" + developmentOrigins(value, mode, [ip]);
    const updated = text.match(pattern)
      ? text.replace(pattern, setting)
      : text.trimEnd() + "\n" + setting + "\n";
    return { path, updated, relativePath };
  });
  for (const update of updates) {
    const temporary =
      update.path + "." + randomBytes(5).toString("hex") + ".tmp";
    writeFileSync(temporary, update.updated, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, update.path);
    console.log("Orígenes reparados en " + update.relativePath);
  }
  console.log("Inicia el juego con pnpm dev.");
  console.log("Menú para compartir http://" + ip + ":5173/");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    repair(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
