import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpm = process.env.npm_execpath;
let active;
let stopped = false;

function stop() {
  stopped = true;
  if (!active?.pid) return;
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(active.pid), "/t"], {
      stdio: "ignore",
    }).unref();
  else {
    try {
      process.kill(-active.pid, "SIGTERM");
    } catch {
      active.kill();
    }
  }
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function run(command, args) {
  if (stopped) throw new Error("Arranque detenido.");
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    detached: process.platform !== "win32",
  });
  active = child;
  return new Promise((done, fail) => {
    child.once("error", fail);
    child.once("exit", (code) =>
      code === 0
        ? done()
        : fail(new Error("La tarea terminó con código " + code + ".")),
    );
  });
}

try {
  if (!pnpm) throw new Error("Ejecuta este arranque con pnpm jugar.");
  for (const mode of ["story", "pvp"])
    await run("docker", [
      "compose",
      "-f",
      "docker/docker-compose." + mode + ".yml",
      "up",
      "-d",
      "--wait",
    ]);
  await run(process.execPath, [pnpm, "db:setup"]);
  console.log("Abre el menú principal en http://127.0.0.1:5173.");
  await run(process.execPath, [pnpm, "dev"]);
} catch (error) {
  if (!stopped) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Comprueba que Docker Desktop esté abierto.");
    process.exitCode = 1;
  }
}
