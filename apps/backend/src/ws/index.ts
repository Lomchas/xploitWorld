import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { sessionCookieName, type RuntimeMode } from "../lib/mode";
import { authenticate } from "../lib/session";
import { clientAddress } from "../lib/client-address";
import { handleMessage } from "./handler";
import { CampaignSession } from "../game/campaign/session";
import { VirtualShell } from "../game/shell";
import { PvpWatch } from "../pvp/watch";
import { WorkspaceService } from "../workspace/service";

export function initWsServer(
  httpServer: Server,
  db: PrismaClient,
  allowedOrigins: string[],
  trustedProxyIps: readonly string[] = [],
  mode: RuntimeMode = "legacy",
  secure = false,
): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 8 * 1024,
    perMessageDeflate: false,
  });
  // Includes pending upgrades so parallel handshakes cannot bypass the cap.
  const cookieName = sessionCookieName(mode, secure);
  const pvpWatch = mode !== "story" ? new PvpWatch(db) : null;
  const workspace = new WorkspaceService(db);
  const ipConnections = new Map<string, number>();
  let pendingUpgrades = 0;
  const live = new Map<WebSocket, { alive: boolean; expiresAt: number }>();
  httpServer.on("upgrade", (request, socket, head) => {
    const reject = (status: number): void => {
      socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
    };
    socket.on("error", () => {
      socket.destroy();
    });
    const origin = request.headers.origin;
    if (
      request.url?.split("?")[0] !== "/ws" ||
      (origin && !allowedOrigins.includes(origin))
    ) {
      reject(403);
      return;
    }
    const ip = clientAddress(request, trustedProxyIps);
    if (
      (ipConnections.get(ip) ?? 0) >= 10 ||
      live.size + pendingUpgrades >= 1000
    ) {
      reject(429);
      return;
    }
    ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1);
    pendingUpgrades++;
    let pending = true;
    const finishUpgrade = (): void => {
      if (pending) {
        pending = false;
        pendingUpgrades--;
      }
    };
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      finishUpgrade();
      const count = (ipConnections.get(ip) ?? 1) - 1;
      if (count <= 0) ipConnections.delete(ip);
      else ipConnections.set(ip, count);
    };
    socket.once("close", release);
    const timeout = setTimeout(() => {
      release();
      socket.destroy();
    }, 5000);
    void authenticate(db, request, cookieName)
      .then(async (session) => {
        if (!session) {
          clearTimeout(timeout);
          finishUpgrade();
          reject(401);
          return;
        }
        const tutorial =
          mode === "pvp"
            ? null
            : await db.level.findFirst({
                where: { slug: "level-1-basic-commands", isActive: true },
                select: { flag: true },
              });
        clearTimeout(timeout);
        if (socket.destroyed) return;
        finishUpgrade();
        wss.handleUpgrade(request, socket, head, (ws) => {
          live.set(ws, { alive: true, expiresAt: session.expiresAt.getTime() });
          const shell =
            mode === "pvp" ? null : new VirtualShell(tutorial?.flag ?? null);
          const campaign = shell
            ? new CampaignSession(db, session.user.id, shell, workspace)
            : null;
          let windowStart = Date.now();
          let count = 0;
          let queue = Promise.resolve();
          ws.on("pong", () => {
            const state = live.get(ws);
            if (state) state.alive = true;
          });
          ws.on("message", (data, binary) => {
            if (Date.now() >= session.expiresAt.getTime()) {
              ws.close(1008, "Session expired");
              return;
            }
            if (binary) {
              ws.close(1003, "Text messages only");
              return;
            }
            const now = Date.now();
            if (now - windowStart >= 10_000) {
              windowStart = now;
              count = 0;
            }
            if (++count > 30) {
              ws.close(1008, "Too many commands");
              return;
            }
            // Preserve per-player command order, and refuse revoked sessions on the next message.
            queue = queue
              .then(async () => {
                if (ws.readyState !== WebSocket.OPEN) return;
                const current = await authenticate(db, request, cookieName);
                if (!current) {
                  ws.close(1008, "Session expired or revoked");
                  return;
                }
                await handleMessage(
                  ws,
                  data.toString(),
                  shell,
                  pvpWatch
                    ? async (type) => {
                        if (type === "pvp_watch")
                          await pvpWatch.subscribe(ws, current);
                        else pvpWatch.unsubscribe(ws);
                      }
                    : undefined,
                  campaign
                    ? (raw, locale) => campaign.execute(raw, locale)
                    : undefined,
                );
              })
              .catch(() => {
                ws.close(1011, "Session validation failed");
              });
          });
          ws.on("error", (err) => {
            console.error("WebSocket error:", err.message);
          });
          ws.on("close", () => {
            live.delete(ws);
            pvpWatch?.unsubscribe(ws);
            release();
          });
          wss.emit("connection", ws, request);
        });
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        finishUpgrade();
        console.error(
          "Upgrade failed:",
          err instanceof Error ? err.message : "Unknown error",
        );
        if (!socket.destroyed) reject(503);
      });
  });
  const heartbeat = setInterval(() => {
    for (const [ws, state] of live) {
      if (!state.alive || Date.now() >= state.expiresAt) {
        ws.terminate();
        continue;
      }
      state.alive = false;
      ws.ping();
    }
  }, 30_000);
  heartbeat.unref();
  wss.once("close", () => {
    clearInterval(heartbeat);
    pvpWatch?.stop();
  });
  return wss;
}
