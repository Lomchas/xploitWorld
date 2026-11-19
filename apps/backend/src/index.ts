import "dotenv/config";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { config, allowedOrigins, trustedProxyIps } from "./config";
import { createApp } from "./app";
import { initWsServer } from "./ws";
import { prisma } from "./lib/prisma";
import { verifyWorldDatabase, type GameMode } from "./lib/mode";
import { settleDue } from "./exchange/services";

async function main(): Promise<void> {
  const mode = config.GAME_MODE as GameMode;
  const arenaWeb = config.XWD_SERVE_ARENA
    ? resolve(__dirname, "../../frontend/dist/pvp-standalone")
    : undefined;
  if (
    arenaWeb &&
    (mode !== "pvp" || !existsSync(resolve(arenaWeb, "index.html")))
  )
    throw new Error("Compila Arena con pnpm build:pvp antes de servirla.");
  await prisma.$connect();
  await verifyWorldDatabase(prisma, mode);
  const httpServer = createServer(
    createApp(prisma, {
      allowedOrigins,
      production: config.isProduction,
      trustedProxyIps,
      mode,
      arenaWeb,
    }),
  );
  const wsServer = initWsServer(
    httpServer,
    prisma,
    allowedOrigins,
    trustedProxyIps,
    mode,
    config.isProduction,
  );
  httpServer.requestTimeout = 15_000;
  httpServer.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.PORT, config.HOST, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
  console.log(
    `XploitworlD ${mode} listening on http://${config.HOST}:${config.PORT}`,
  );
  let settlement: Promise<void> | undefined;
  const settle = (): void => {
    if (settlement) return;
    settlement = settleDue(prisma, new Date())
      .catch((error: unknown) =>
        console.error("Exchange settlement failed", error),
      )
      .finally(() => {
        settlement = undefined;
      });
  };
  const settlementTimer =
    mode === "pvp" ? setInterval(settle, 60_000) : undefined;
  if (mode === "pvp") settle();
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    clearInterval(settlementTimer);
    console.log("Closing connections...");
    const force = setTimeout(() => {
      process.exit(1);
    }, 10_000);
    force.unref();
    for (const client of wsServer.clients) client.terminate();
    wsServer.close();
    httpServer.close(() => {
      void Promise.resolve(settlement)
        .then(() => prisma.$disconnect())
        .finally(() => {
          clearTimeout(force);
          process.exit(0);
        });
    });
    httpServer.closeIdleConnections();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
main().catch(async (err: unknown) => {
  console.error("Failed to start:", err instanceof Error ? err.message : err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
