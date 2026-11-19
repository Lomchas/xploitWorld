import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(root, "apps/backend");
const pnpm = process.env.npm_execpath;
const children = new Set();
const stopSignal = new AbortController();

function launch(command, args, { cwd = root, env = {}, pipe = false } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: pipe ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  children.add(child);
  const done = new Promise((settle) => {
    let error;
    child.once("error", (reason) => {
      error = reason;
    });
    child.once("close", (code) => settle({ code: code ?? 1, error }));
  }).finally(() => children.delete(child));
  return { child, done };
}

function stop() {
  stopSignal.abort();
  for (const child of children) child.kill();
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

function requireActive() {
  stopSignal.signal.throwIfAborted();
}

async function run(command, args, options = {}) {
  requireActive();
  const execution = launch(command, args, options);
  let output = "";
  execution.child.stdout?.on("data", (part) => {
    output += part;
  });
  execution.child.stderr?.on("data", (part) => {
    output += part;
  });
  const { code, error } = await execution.done;
  requireActive();
  if (code) {
    const details = error?.message ?? output.trim();
    throw new Error(
      command +
        " terminó con código " +
        code +
        (details ? "\n" + details : "."),
    );
  }
  return output.trim();
}

const packageTask = (args, env = {}) =>
  run(process.execPath, [pnpm, ...args], { env });
const backendTask = (name, env) =>
  packageTask(["--filter", "@null-protocol/backend", name], env);

async function build() {
  await packageTask(["--filter", "@null-protocol/shared", "build"]);
  await backendTask("build", {});
  await packageTask(
    [
      "--filter",
      "@null-protocol/frontend",
      "exec",
      "vite",
      "build",
      "--mode",
      "pvp",
      "--outDir",
      "dist/pvp-standalone",
    ],
    { VITE_STANDALONE_PVP: "true", VITE_API_URL: "", VITE_WS_URL: "" },
  );
}

function arenaEnv(database, origin, host, port) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Arena necesita un origen HTTPS válido sin ruta.");
  return {
    DATABASE_URL: database,
    FRONTEND_ORIGINS: url.origin,
    PORT: String(port),
    HOST: host,
    GAME_MODE: "pvp",
    NODE_ENV: "production",
    XWD_SERVE_ARENA: "true",
  };
}

async function prepareDatabase(env) {
  await backendTask("prisma:migrate:deploy", env);
  await backendTask("prisma:seed", env);
}

function startBackend(env) {
  requireActive();
  return launch(process.execPath, ["dist/index.js"], { cwd: backend, env });
}

async function host() {
  const database = process.env.DATABASE_URL;
  const origin =
    process.env.XWD_PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if (!database || !origin)
    throw new Error("Configura DATABASE_URL y el origen HTTPS de Arena.");
  const env = arenaEnv(
    database,
    origin,
    process.env.HOST || "0.0.0.0",
    process.env.PORT || 10000,
  );
  await prepareDatabase(env);
  const { code, error } = await startBackend(env).done;
  if (error) throw error;
  if (!stopSignal.signal.aborted) process.exitCode = code;
}

async function localPort() {
  const server = createServer();
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? fail(error) : done(port)));
    });
  });
}

async function tunnelUrl(tunnel) {
  let output = "";
  let timer;
  let removeAbort;
  try {
    return await new Promise((done, fail) => {
      const accept = (part) => {
        output = (output + part).slice(-8000);
        const found = /https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i.exec(
          output,
        );
        if (found) done(found[0]);
      };
      const interrupt = () => fail(stopSignal.signal.reason);
      removeAbort = () =>
        stopSignal.signal.removeEventListener("abort", interrupt);
      stopSignal.signal.addEventListener("abort", interrupt, { once: true });
      tunnel.child.stdout.on("data", accept);
      tunnel.child.stderr.on("data", accept);
      void tunnel.done.then(({ error }) =>
        fail(
          new Error(
            error?.message ?? "Cloudflare cerró el túnel.\n" + output.trim(),
          ),
        ),
      );
      timer = setTimeout(
        () =>
          fail(new Error("Cloudflare no entregó el enlace.\n" + output.trim())),
        60_000,
      );
    });
  } finally {
    clearTimeout(timer);
    removeAbort?.();
  }
}

async function checkArena(port) {
  for (let attempt = 0; attempt < 30; attempt++) {
    requireActive();
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/health", {
        signal: AbortSignal.timeout(750),
      });
      if (response.ok && (await response.json()).mode === "pvp") return;
    } catch (error) {
      if (!(error instanceof TypeError) && error.name !== "TimeoutError")
        throw error;
    }
    await pause(500, undefined, { signal: stopSignal.signal });
  }
  throw new Error("Arena no respondió en el puerto local " + port + ".");
}

async function share(emails) {
  if (emails.some((email) => !/^[^\s,@*]+@[^\s,@*]+\.[^\s,@*]+$/.test(email)))
    throw new Error(
      "Usa pnpm compartir:pvp seguido de correos individuales, si los necesitas.",
    );
  const cloudflared = "cloudflared";
  await run(cloudflared, ["--version"], { pipe: true }).catch((error) => {
    requireActive();
    if (error.message.includes("ENOENT"))
      throw new Error(
        "Instala Cloudflare Tunnel con winget install --id Cloudflare.cloudflared -e y vuelve a abrir PowerShell.",
      );
    throw error;
  });
  await run("docker", ["compose", "version"], { pipe: true });
  const password = randomBytes(24).toString("hex");
  const project = "xploitworld-prueba-" + randomBytes(6).toString("hex");
  const compose = [
    "compose",
    "-p",
    project,
    "-f",
    "docker/docker-compose.pvp-prueba.yml",
  ];
  const options = { env: { XWD_DEMO_DB_PASSWORD: password } };
  let tunnel;
  let server;
  let needsCleanup = false;
  try {
    await build();
    needsCleanup = true;
    console.log("Preparando la base temporal de Arena…");
    await run("docker", [...compose, "up", "-d", "--wait"], options);
    const binding = await run(
      "docker",
      [...compose, "port", "postgres", "5432"],
      {
        ...options,
        pipe: true,
      },
    );
    const dbPort = binding.match(/^127\.0\.0\.1:(\d+)\b/m)?.[1];
    if (!dbPort)
      throw new Error("Docker no informó el puerto local de PostgreSQL.");
    const database =
      "postgresql://xwd_demo:" +
      password +
      "@127.0.0.1:" +
      dbPort +
      "/xwd_demo";
    await prepareDatabase({ GAME_MODE: "pvp", DATABASE_URL: database });
    const port = await localPort();
    const access = emails.flatMap((email) => ["--allowed-mail", email]);
    tunnel = launch(
      cloudflared,
      [
        "tunnel",
        "--no-autoupdate",
        "--url",
        "http://127.0.0.1:" + port,
        ...access,
      ],
      { pipe: true },
    );
    const url = await tunnelUrl(tunnel);
    const env = arenaEnv(database, url, "127.0.0.1", port);
    env.TRUST_PROXY_IPS = "127.0.0.1";
    server = startBackend(env);
    await Promise.race([
      checkArena(port),
      server.done.then(() => {
        throw new Error("El servidor de Arena se cerró.");
      }),
      tunnel.done.then(() => {
        throw new Error("El túnel de Cloudflare se cerró.");
      }),
    ]);
    requireActive();
    console.log(
      "\nAbre este mismo enlace en los dos equipos:\n" + url + "/pvp\n",
    );
    console.log(
      "Elijan la misma arena y dos usuarios distintos. Ctrl+C termina la prueba.",
    );
    const outcome = await Promise.race([server.done, tunnel.done]);
    if (!stopSignal.signal.aborted)
      throw new Error(
        outcome.error?.message ??
          "Se cerró el servidor o el túnel. Ejecuta otra vez pnpm compartir:pvp.",
      );
  } finally {
    tunnel?.child.kill();
    server?.child.kill();
    await Promise.all([tunnel?.done, server?.done]);
    if (needsCleanup) {
      const cleanup = launch(
        "docker",
        [...compose, "down", "--volumes"],
        options,
      );
      if ((await cleanup.done).code)
        console.error(
          "No se pudo borrar el contenedor temporal del proyecto " +
            project +
            ". Puedes eliminarlo desde Docker Desktop.",
        );
    }
  }
}

try {
  if (!pnpm) throw new Error("Ejecuta esta tarea con pnpm.");
  const [command, ...args] = process.argv.slice(2);
  if (command === "build") await build();
  else if (command === "host") await host();
  else if (command === "share") await share(args);
  else throw new Error("Tarea de Arena desconocida.");
} catch (error) {
  if (!stopSignal.signal.aborted) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
