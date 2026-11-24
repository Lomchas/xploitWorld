import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentOrigins } from "./lan-config.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(root, "apps/backend");
const frontend = resolve(root, "apps/frontend");
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Ejecuta esta tarea con pnpm.");

function readEnvironment(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8")
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/)) {
    const entry = /^([A-Z_]+)=(.*)$/.exec(line);
    if (entry) values[entry[1]] = entry[2];
  }
  return values;
}

const profiles = {
  story: readEnvironment(resolve(backend, ".env")),
  pvp: readEnvironment(resolve(backend, ".env.pvp")),
};
for (const mode of Object.keys(profiles)) {
  const prefix = mode === "story" ? "STORY" : "PVP";
  const database = process.env[prefix + "_DATABASE_URL"];
  if (database) profiles[mode].DATABASE_URL = database;
  if (profiles[mode].GAME_MODE !== mode)
    throw new Error("Configuración de entorno incorrecta para " + mode);
  if (process.argv[2] === "dev")
    profiles[mode].FRONTEND_ORIGINS = developmentOrigins(
      profiles[mode].FRONTEND_ORIGINS || "",
      mode,
    );
}
const databaseKey = (value) => {
  const url = new URL(value);
  return [
    url.hostname.replace("localhost", "127.0.0.1"),
    url.port || "5432",
    url.pathname,
  ].join("/");
};
if (
  databaseKey(profiles.story.DATABASE_URL) ===
  databaseKey(profiles.pvp.DATABASE_URL)
)
  throw new Error("Historia y PvP necesitan bases de datos distintas.");

const command = process.argv[2];
const children = new Set();
const target = (mode) =>
  process.env[mode.toUpperCase() + "_BACKEND_ORIGIN"] ??
  "http://127.0.0.1:" + profiles[mode].PORT;
function run(cwd, args, extra = {}) {
  const child = spawn(process.execPath, [pnpm, ...args], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extra },
    detached: process.platform !== "win32",
  });
  children.add(child);
  return new Promise((done, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      children.delete(child);
      done(code ?? 1);
    });
  });
}
function stop() {
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(child.pid), "/t"], {
        stdio: "ignore",
      }).unref();
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }
  }
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const requireSuccess = async (child) => {
  const code = await child;
  if (code)
    throw new Error("La tarea de instalación terminó con código " + code);
};
const web = (mode, task) =>
  run(frontend, [task, "--mode", mode], {
    DEV_BACKEND_URL: mode === "menu" ? "" : target(mode),
  });
const buildShared = () =>
  run(root, ["--filter", "@null-protocol/shared", "build"]);

if (command === "db") {
  await requireSuccess(buildShared());
  await requireSuccess(run(backend, ["prisma:generate"], profiles.story));
  for (const mode of ["story", "pvp"]) {
    await requireSuccess(
      run(backend, ["prisma:migrate:deploy"], profiles[mode]),
    );
    await requireSuccess(run(backend, ["prisma:seed"], profiles[mode]));
  }
} else if (command === "migrate") {
  await requireSuccess(buildShared());
  await requireSuccess(
    run(backend, ["migrate:split"], {
      STORY_DATABASE_URL: profiles.story.DATABASE_URL,
      PVP_DATABASE_URL: profiles.pvp.DATABASE_URL,
    }),
  );
} else if (command === "admin") {
  const [task, ...args] = process.argv.slice(3);
  if (task !== "resolve:dispute" && task !== "demo:pvp")
    throw new Error("Tarea de Arena inválida.");
  await requireSuccess(buildShared());
  await requireSuccess(run(backend, [task, ...args], profiles.pvp));
} else if (command === "dev" || command === "preview") {
  const selected = process.argv[3];
  if (selected && !["menu", "story", "pvp"].includes(selected))
    throw new Error("Selecciona menu, story o pvp.");
  const modes = selected ? [selected] : ["menu", "story", "pvp"];
  if (command === "dev") await requireSuccess(buildShared());
  const jobs = modes.flatMap((mode) => [
    ...(command === "dev" && mode !== "menu"
      ? [run(backend, ["dev"], profiles[mode])]
      : []),
    web(mode, command),
  ]);
  if (command === "dev" && !selected)
    jobs.push(run(root, ["--filter", "@null-protocol/shared", "dev"]));
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      try {
        const code = await job;
        if (code) stop();
        return code;
      } catch (error) {
        stop();
        throw error;
      }
    }),
  );
  process.exitCode = results.some(
    (item) => item.status === "rejected" || item.value !== 0,
  )
    ? 1
    : 0;
} else {
  throw new Error("Tarea de mundo inválida.");
}
