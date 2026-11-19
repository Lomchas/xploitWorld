import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configuration = resolve(root, ".env.server");
const compose = [
  "compose",
  "--env-file",
  configuration,
  "-f",
  resolve(root, "docker/docker-compose.server.yml"),
];

function environment() {
  if (!existsSync(configuration)) return {};
  return Object.fromEntries(
    readFileSync(configuration, "utf8")
      .split(/\r?\n/u)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const split = line.indexOf("=");
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
}

function domain(value) {
  if (isIP(value) === 4)
    return "xploitworld." + value.replaceAll(".", "-") + ".sslip.io";
  const hostname = value.toLowerCase().replace(/\.$/u, "");
  const valid =
    hostname.length <= 240 &&
    hostname.includes(".") &&
    hostname
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label));
  if (!valid || isIP(value))
    throw new Error(
      "Indica la IPv4 pública del servidor o un dominio, como juego.ejemplo.com.",
    );
  return hostname;
}

function initialize(target) {
  if (!target)
    throw new Error(
      "Ejecuta pnpm servidor:config IP_PUBLICA o node scripts/server.mjs config IP_PUBLICA.",
    );
  const base = domain(target);
  const saved = environment();
  const password = (key) => {
    if (saved[key] && !/^[a-f0-9]{64}$/u.test(saved[key]))
      throw new Error(
        "La contraseña guardada de " +
          key +
          " tiene un formato inesperado. Conserva .env.server y revisa ese valor.",
      );
    return saved[key] || randomBytes(32).toString("hex");
  };
  const values = {
    XWD_MENU_HOST: base,
    XWD_STORY_HOST: "historia." + base,
    XWD_PVP_HOST: "pvp." + base,
    XWD_STORY_DB_PASSWORD: password("XWD_STORY_DB_PASSWORD"),
    XWD_PVP_DB_PASSWORD: password("XWD_PVP_DB_PASSWORD"),
  };
  const temporary =
    configuration + "." + randomBytes(5).toString("hex") + ".tmp";
  writeFileSync(
    temporary,
    Object.entries(values)
      .map(([key, value]) => key + "=" + value)
      .join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  renameSync(temporary, configuration);
  console.log("Configuración de servidor preparada en .env.server.");
  printUrls(values);
}

function printUrls(values) {
  console.log("Menú       https://" + values.XWD_MENU_HOST);
  console.log("Historia   https://" + values.XWD_STORY_HOST + "/historia");
  console.log("PvP        https://" + values.XWD_PVP_HOST + "/pvp");
}

async function start() {
  const values = environment();
  if (
    !values.XWD_MENU_HOST ||
    !values.XWD_STORY_DB_PASSWORD ||
    !values.XWD_PVP_DB_PASSWORD
  )
    throw new Error("Prepara el servidor con pnpm servidor:config IP_PUBLICA.");
  const result = spawnSync(
    "docker",
    [...compose, "up", "-d", "--build", "--wait", "--wait-timeout", "180"],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error)
    throw new Error(
      "Docker no se pudo iniciar. Instala Docker Engine con Compose v2 y comprueba que esté ejecutándose.",
    );
  if (result.status) {
    process.exitCode = result.status;
    console.error(
      "Consulta el estado con docker compose --env-file .env.server -f docker/docker-compose.server.yml logs --tail=60.",
    );
    return;
  }
  console.log("Comprobando HTTPS y los tres puntos de entrada del juego.");
  const hosts = {
    menu: values.XWD_MENU_HOST,
    story: values.XWD_STORY_HOST,
    pvp: values.XWD_PVP_HOST,
  };
  for (let attempt = 0; attempt < 12; attempt++) {
    const checks = await Promise.all(
      Object.entries(hosts).map(async ([mode, host]) => {
        try {
          const response = await fetch("https://" + host + "/health", {
            signal: AbortSignal.timeout(5000),
          });
          return response.ok && (await response.json()).mode === mode;
        } catch {
          return false;
        }
      }),
    );
    if (checks.every(Boolean)) {
      console.log("El juego completo está disponible por HTTPS.");
      printUrls(values);
      return;
    }
    if (attempt < 11) await pause(2500);
  }
  printUrls(values);
  throw new Error(
    "Revisa que el DNS apunte al VPS y que TCP 80 y 443 estén accesibles. Consulta los registros de web con docker compose --env-file .env.server -f docker/docker-compose.server.yml logs web --tail=60.",
  );
}

try {
  const [command, target] = process.argv.slice(2);
  if (command === "config") initialize(target);
  else if (command === "start") await start();
  else throw new Error("Usa servidor:config IP_PUBLICA o servidor:iniciar.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
