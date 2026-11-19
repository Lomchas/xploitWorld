import type { PrismaClient } from "@prisma/client";
import { WebSocket } from "ws";
import type { WsMessage } from "@null-protocol/shared";
import type { AuthenticatedSession } from "../lib/session";

type Revision = { revision: number; worldRevision: number };
interface Watch extends Revision {
  profileId: string;
  sessionId: string;
  expiresAt: number;
}
const UPDATE_INTERVAL_MS = 800;

/** WebSocket invalidations contain version numbers only. State is fetched with the normal authenticated API. */
export class PvpWatch {
  private readonly watchers = new Map<WebSocket, Watch>();
  private readonly timer: ReturnType<typeof setInterval>;
  private checking = false;

  constructor(private readonly db: PrismaClient) {
    this.timer = setInterval(() => {
      void this.check();
    }, UPDATE_INTERVAL_MS);
    this.timer.unref();
  }
  async subscribe(
    socket: WebSocket,
    session: AuthenticatedSession,
  ): Promise<void> {
    const profile = await this.db.pvpProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        id: true,
        revision: true,
        region: { select: { revision: true } },
      },
    });
    if (!profile || socket.readyState !== WebSocket.OPEN) return;
    const watch = {
      profileId: profile.id,
      sessionId: session.id,
      expiresAt: session.expiresAt.getTime(),
      revision: profile.revision,
      worldRevision: profile.region.revision,
    };
    this.watchers.set(socket, watch);
    this.send(socket, watch);
  }
  unsubscribe(socket: WebSocket): void {
    this.watchers.delete(socket);
  }
  stop(): void {
    clearInterval(this.timer);
    this.watchers.clear();
  }
  private send(socket: WebSocket, version: Revision): boolean {
    if (
      socket.readyState !== WebSocket.OPEN ||
      socket.bufferedAmount > 64 * 1024
    )
      return false;
    const message: WsMessage<"pvp_update", Revision> = {
      type: "pvp_update",
      payload: {
        revision: version.revision,
        worldRevision: version.worldRevision,
      },
    };
    socket.send(JSON.stringify(message));
    return true;
  }
  private async check(): Promise<void> {
    if (this.checking || this.watchers.size === 0) return;
    this.checking = true;
    try {
      const watched = [...this.watchers];
      const ids = [...new Set(watched.map(([, watch]) => watch.profileId))];
      const profiles = await this.db.pvpProfile.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          revision: true,
          region: { select: { revision: true } },
        },
      });
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      const changed = watched.filter(([socket, watch]) => {
        const current = byId.get(watch.profileId);
        return (
          this.watchers.get(socket) === watch &&
          current &&
          (current.revision !== watch.revision ||
            current.region.revision !== watch.worldRevision)
        );
      });
      if (!changed.length) return;
      const sessions = await this.db.session.findMany({
        where: {
          id: { in: changed.map(([, watch]) => watch.sessionId) },
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      const active = new Set(sessions.map((session) => session.id));
      for (const [socket, watch] of changed) {
        if (this.watchers.get(socket) !== watch) continue;
        if (Date.now() >= watch.expiresAt || !active.has(watch.sessionId)) {
          this.unsubscribe(socket);
          socket.close(1008, "Session expired or revoked");
          continue;
        }
        const profile = byId.get(watch.profileId)!;
        const version = {
          revision: profile.revision,
          worldRevision: profile.region.revision,
        };
        if (this.send(socket, version)) Object.assign(watch, version);
      }
    } catch {
      // The next tick and the browser's refresh reconcile transient database failures.
    } finally {
      this.checking = false;
    }
  }
}
