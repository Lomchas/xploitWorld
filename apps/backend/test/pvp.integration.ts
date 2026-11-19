import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { WebSocket } from "ws";
import type {
  PvpAction,
  PvpActionResult,
  PvpEvent,
  PvpJoinResult,
  PvpRegionId,
  PvpState,
  WorldState,
  WsMessage,
} from "@null-protocol/shared";
import { createApp } from "../src/app";
import { PvpService } from "../src/pvp/service";
import { initWsServer } from "../src/ws";
import { createTestDatabase } from "./helpers/database";

const dbUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(dbUrl) && process.env.NODE_ENV === "test";
const origin = "http://localhost:5173";
type Player = { cookie: string; base: string; profileId: string };
interface TestServer {
  base: string;
  stop: () => Promise<void>;
}

async function startServer(
  db: PrismaClient,
  clock: () => Date,
): Promise<TestServer> {
  const http = createServer(
    createApp(
      db,
      { allowedOrigins: [origin], production: false },
      new PvpService(db, clock),
    ),
  );
  const wss = initWsServer(http, db, [origin]);
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  assert.ok(address && typeof address === "object");
  return {
    base: "http://127.0.0.1:" + address.port,
    stop: async () => {
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      http.closeIdleConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
async function guest(base: string): Promise<Player> {
  const response = await fetch(base + "/api/session", { method: "POST" });
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return { cookie, base, profileId: "" };
}
function request(
  player: Player,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(player.base + "/api/pvp/" + path, {
    headers: {
      Cookie: player.cookie,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined
      ? {}
      : { method: "POST", body: JSON.stringify(body) }),
  });
}
async function read<T>(response: Response, status = 200): Promise<T> {
  const body: unknown = await response.json();
  assert.equal(response.status, status, JSON.stringify(body));
  return body as T;
}
function deploy(
  player: Player,
  regionId: PvpRegionId,
  alias: string,
): Promise<Response> {
  return request(player, "join", { regionId, alias });
}
async function state(player: Player, query = ""): Promise<PvpState> {
  return read<PvpState>(
    await request(player, "state?q=" + encodeURIComponent(query)),
  );
}
function send(
  player: Player,
  action: PvpAction,
  requestId = randomUUID(),
): Promise<Response> {
  return request(player, "action", { requestId, action });
}
async function act(
  player: Player,
  action: PvpAction,
): Promise<PvpActionResult> {
  return read<PvpActionResult>(await send(player, action));
}
async function update(
  socket: WebSocket,
): Promise<
  WsMessage<"pvp_update", { revision: number; worldRevision: number }>
> {
  const [frame] = await once(socket, "message", {
    signal: AbortSignal.timeout(5000),
  });
  const result = JSON.parse(String(frame)) as WsMessage<
    "pvp_update",
    { revision: number; worldRevision: number }
  >;
  assert.equal(result.type, "pvp_update");
  return result;
}
async function observe(player: Player): Promise<WebSocket> {
  const socket = new WebSocket(player.base.replace("http:", "ws:") + "/ws", {
    headers: { Cookie: player.cookie, Origin: origin },
  });
  await once(socket, "open", { signal: AbortSignal.timeout(5000) });
  const initial = update(socket);
  socket.send(JSON.stringify({ type: "pvp_watch", payload: null }));
  await initial;
  return socket;
}

describe(
  "PvP across authenticated clients",
  { skip: enabled ? false : "Set NODE_ENV=test and TEST_DATABASE_URL" },
  () => {
    const schema = "null_test_" + randomUUID().replaceAll("-", "");
    let db: PrismaClient;
    let first: TestServer;
    let second: TestServer;
    let attacker: Player;
    let defender: Player;
    let otherRegion: Player;
    let serverTime = Date.UTC(2026, 10, 9, 15);
    let incident: PvpEvent;
    const advance = (ms: number): void => {
      serverTime += ms;
    };
    const scan = (player: Player, target: Player): Promise<PvpActionResult> =>
      act(player, { type: "scan", targetId: target.profileId });
    const exploit = (
      player: Player,
      target: Player,
      port = 80,
    ): Promise<PvpActionResult> =>
      act(player, {
        type: "exploit",
        targetId: target.profileId,
        protocol: "tcp",
        port,
      });

    before(async () => {
      db = await createTestDatabase(dbUrl!, schema);
      const clock = (): Date => new Date(serverTime);
      first = await startServer(db, clock);
      second = await startServer(db, clock);
      attacker = await guest(first.base);
      defender = await guest(second.base);
      otherRegion = await guest(second.base);
    });
    after(async () => {
      if (first) await first.stop();
      if (second) await second.stop();
      if (db) {
        await db.$executeRawUnsafe(
          'DROP SCHEMA IF EXISTS "' + schema + '" CASCADE',
        );
        await db.$disconnect();
      }
    });

    it("requires a session and grants exactly 20 BTC in concurrent first joins", async () => {
      assert.equal((await fetch(first.base + "/api/pvp/state")).status, 401);
      assert.equal((await state(attacker)).self, null);
      const responses = await Promise.all([
        deploy(attacker, "sa", "Echo-Red"),
        deploy(attacker, "sa", "Echo-Red"),
      ]);
      assert.deepEqual(
        responses.map((response) => response.status).sort(),
        [200, 201],
      );
      const results = await Promise.all(
        responses.map((response) => response.json() as Promise<PvpJoinResult>),
      );
      assert.equal(results.filter((result) => result.granted).length, 1);
      assert.equal(results[0]!.self.id, results[1]!.self.id);
      attacker.profileId = results[0]!.self.id;
      const self = results[0]!.self;
      assert.equal(self.balanceSats, "2000000000");
      assert.deepEqual(self.config.tools, []);
      assert.ok(
        Object.values(self.config.services).every(
          (service) => service.open && !service.patched,
        ),
      );
      const entries = await db.walletEntry.findMany({
        where: { user: { pvpProfile: { id: attacker.profileId } } },
      });
      assert.equal(entries.length, 1);
      assert.equal(entries[0]!.deltaSats, 2_000_000_000n);
      assert.equal((await deploy(attacker, "eu", "Echo-Red")).status, 409);
    });

    it("isolates regions, hides private state, and rejects spoofed targets", async () => {
      defender.profileId = (
        await read<PvpJoinResult>(
          await deploy(defender, "sa", "Vektor-Blue"),
          201,
        )
      ).self.id;
      otherRegion.profileId = (
        await read<PvpJoinResult>(
          await deploy(otherRegion, "eu", "Ghost-EU"),
          201,
        )
      ).self.id;
      const duplicate = await guest(first.base);
      assert.equal((await deploy(duplicate, "sa", "echo-red")).status, 409);
      const roster = await state(attacker);
      assert.deepEqual(
        roster.peers.map((peer) => peer.id),
        [defender.profileId],
      );
      assert.equal("balanceSats" in roster.peers[0]!, false);
      assert.equal("config" in roster.peers[0]!, false);
      assert.equal("userId" in roster.peers[0]!, false);
      assert.equal(
        (await state(attacker, roster.peers[0]!.address)).peerCount,
        1,
      );
      assert.equal(
        (await state(attacker, roster.peers[0]!.ipv4!)).peerCount,
        1,
      );
      assert.equal((await request(attacker, "state?q=ghost-eu")).status, 400);
      assert.equal((await state(attacker, "203.0.113.7")).peerCount, 0);
      assert.equal(
        (
          await send(attacker, {
            type: "scan",
            targetId: otherRegion.profileId,
          })
        ).status,
        404,
      );
      assert.equal(
        (await send(attacker, { type: "scan", targetId: attacker.profileId }))
          .status,
        400,
      );
      assert.equal(
        (
          await request(attacker, "action", {
            requestId: randomUUID(),
            action: { type: "scan", targetId: "http://127.0.0.1" },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(attacker, "action", {
            requestId: randomUUID(),
            action: { type: "repair", balanceSats: "999999" },
          })
        ).status,
        400,
      );
    });

    it("commits damage and private alerts once, and pushes revisions to a second server", async () => {
      for (const tool of ["ids", "capture", "analyzer", "firewall"] as const)
        await act(defender, { type: "install", tool });
      const socket = await observe(defender);
      try {
        const notified = update(socket);
        const recon = await scan(attacker, defender);
        assert.deepEqual(
          recon.ports
            ?.filter((port) => port.state === "open")
            .map((port) => port.port),
          [22, 80, 53],
        );
        const requestId = randomUUID();
        const action = {
          type: "exploit",
          targetId: defender.profileId,
          protocol: "tcp",
          port: 80,
        } as const;
        const hits = await Promise.all([
          send(attacker, action, requestId),
          send(attacker, action, requestId),
        ]);
        const results = await Promise.all(
          hits.map((response) => read<PvpActionResult>(response)),
        );
        assert.deepEqual(results[0], results[1]);
        assert.equal(results[0]!.outcome, "hit");
        const message = await notified;
        assert.ok(message.payload.revision > 0);
        assert.deepEqual(Object.keys(message.payload).sort(), [
          "revision",
          "worldRevision",
        ]);
        const victim = await state(defender);
        assert.equal(victim.self?.integrity, 66);
        const alerts = victim.events.filter(
          (event) => event.kind === "alert" && event.incident === "probe",
        );
        assert.equal(alerts.length, 1);
        incident = alerts[0]!;
        assert.equal(incident.peerId, attacker.profileId);
        assert.ok(incident.specimen?.hex);
        assert.ok(incident.flows?.[0]?.trace.includes("SYN-ACK"));
        assert.equal(
          (await send(attacker, { ...action, port: 22 }, requestId)).status,
          409,
        );
        assert.equal((await send(attacker, action)).status, 409);
        assert.equal(
          (await state(otherRegion)).events.some(
            (event) => event.kind === "alert",
          ),
          false,
        );
      } finally {
        socket.terminate();
      }
    });

    it("uses private evidence for analysis, retaliation, acknowledgement and blocking", async () => {
      const report = await act(defender, {
        type: "analyze",
        eventId: incident.id,
      });
      assert.equal(report.analysis?.signature, "NPX-WEB-01");
      await act(attacker, { type: "install", tool: "analyzer" });
      assert.equal(
        (await send(attacker, { type: "analyze", eventId: incident.id }))
          .status,
        404,
      );
      assert.equal(
        (
          await act(defender, {
            type: "counter",
            eventId: incident.id,
            protocol: "tcp",
            port: 80,
          })
        ).outcome,
        "hit",
      );
      assert.equal((await state(attacker)).self?.integrity, 66);
      await act(defender, { type: "ack", eventId: incident.id });
      await act(defender, { type: "block", eventId: incident.id });
      advance(3500);
      assert.equal((await exploit(attacker, defender)).outcome, "blocked");
      assert.equal((await state(defender)).self?.integrity, 66);
      assert.ok(
        (await scan(attacker, defender)).ports?.every(
          (port) => port.state === "filtered",
        ),
      );
      const view = await state(defender);
      assert.ok(
        view.events.find((event) => event.id === incident.id)?.acknowledgedAt,
      );
      assert.equal(view.self?.config.rules[0]?.sourceId, attacker.profileId);
      await act(defender, {
        type: "rule.remove",
        ruleId: view.self!.config.rules[0]!.id,
      });
    });

    it("respects rule priority and isolates both directions", async () => {
      await act(defender, { type: "policy", policy: "drop" });
      const rule = { protocol: "tcp", port: 80, sourceId: null } as const;
      await act(defender, {
        type: "rule.add",
        rule: { action: "allow", ...rule },
      });
      await act(defender, {
        type: "rule.add",
        rule: { action: "drop", ...rule },
      });
      assert.equal(
        (await scan(attacker, defender)).ports?.find((port) => port.port === 80)
          ?.state,
        "open",
      );
      const config = (await state(defender)).self!.config;
      await act(defender, {
        type: "rule.move",
        ruleId: config.rules[1]!.id,
        direction: "up",
      });
      assert.equal(
        (await scan(attacker, defender)).ports?.find((port) => port.port === 80)
          ?.state,
        "filtered",
      );
      for (const item of config.rules)
        await act(defender, { type: "rule.remove", ruleId: item.id });
      await act(defender, { type: "policy", policy: "allow" });
      await act(defender, { type: "isolate", enabled: true });
      assert.equal(
        (await send(defender, { type: "scan", targetId: attacker.profileId }))
          .status,
        409,
      );
      assert.ok(
        (await scan(attacker, defender)).ports?.every(
          (port) => port.state === "filtered",
        ),
      );
      await act(defender, { type: "isolate", enabled: false });
    });

    it("records TLS encryption and protects the service only after applying its patch", async () => {
      advance(20_000);
      await act(defender, { type: "install", tool: "tls" });
      await act(defender, { type: "tls", enabled: true });
      await act(attacker, { type: "install", tool: "capture" });
      const ports = (await scan(attacker, defender)).ports!;
      assert.equal(ports.find((port) => port.port === 80)?.state, "closed");
      assert.equal(ports.find((port) => port.port === 443)?.state, "open");
      assert.equal((await exploit(attacker, defender, 443)).outcome, "hit");
      assert.ok(
        (await state(defender)).events.some((event) =>
          event.flows?.some(
            (flow) => flow.port === 443 && flow.encryption === "tls",
          ),
        ),
      );
      await act(defender, { type: "patch", service: "web" });
      advance(3500);
      const blocked = await exploit(attacker, defender, 443);
      assert.equal(blocked.outcome, "blocked");
      assert.match(blocked.message, /parcheada/);
      assert.equal((await state(defender)).self?.integrity, 32);
      await act(defender, { type: "repair" });
      assert.equal((await state(defender)).self?.integrity, 72);
      assert.equal((await send(defender, { type: "repair" })).status, 409);
    });

    it("authenticates a mutual virtual tunnel, awards a compromise once and restores the device", async () => {
      advance(45_000);
      for (const player of [attacker, defender]) {
        await act(player, { type: "install", tool: "vpn" });
        await act(player, { type: "vpn", enabled: true });
      }
      assert.equal(
        (await scan(attacker, defender)).ports?.find((port) => port.port === 22)
          ?.state,
        "filtered",
      );
      await act(defender, {
        type: "trust",
        targetId: attacker.profileId,
        enabled: true,
      });
      await act(attacker, {
        type: "trust",
        targetId: defender.profileId,
        enabled: true,
      });
      assert.equal(
        (await scan(attacker, defender)).ports?.find((port) => port.port === 22)
          ?.state,
        "open",
      );
      assert.equal((await exploit(attacker, defender, 22)).outcome, "hit");
      advance(3500);
      assert.equal(
        (await exploit(attacker, defender, 22)).outcome,
        "compromised",
      );
      advance(3500);
      assert.equal((await exploit(attacker, defender, 22)).outcome, "blocked");
      const defeated = await state(defender);
      assert.equal(defeated.self?.integrity, 0);
      assert.equal(defeated.leaderboard[0]?.id, attacker.profileId);
      assert.equal(defeated.leaderboard[0]?.score, 10);
      assert.equal(
        (await send(defender, { type: "scan", targetId: attacker.profileId }))
          .status,
        409,
      );
      await act(defender, { type: "repair" });
      assert.equal((await state(defender)).self?.integrity, 40);
      assert.equal((await state(defender)).self?.balanceSats, "2000000000");
    });

    it("preserves a returning device across servers and rejects stale evidence", async () => {
      advance(5 * 60_000 + 1);
      const migratedClient = { ...defender, base: first.base };
      const rejoin = await read<PvpJoinResult>(
        await deploy(migratedClient, "sa", "Vektor-Blue"),
      );
      assert.equal(rejoin.granted, false);
      assert.equal(rejoin.self.id, defender.profileId);
      assert.equal(rejoin.self.config.tls, true);
      assert.equal(rejoin.self.balanceSats, "2000000000");
      assert.equal(
        (
          await send(migratedClient, {
            type: "counter",
            eventId: incident.id,
            protocol: "tcp",
            port: 80,
          })
        ).status,
        409,
      );
      const roster = await state(attacker);
      assert.equal(roster.peers[0]?.online, false);
      assert.equal(roster.peers[0]?.id, defender.profileId);
    });

    it("moves one persistent device between pilot arenas with isolated rosters and history", async () => {
      const operator = await guest(first.base);
      const bogota = await guest(second.base);
      const tokio = await guest(second.base);
      for (const [player, region, alias] of [
        [operator, "bogota", "M6-Operador"],
        [bogota, "bogota", "M6-Bogota"],
        [tokio, "tokio", "M6-Operador"],
      ] as const) {
        player.profileId = (
          await read<PvpJoinResult>(await deploy(player, region, alias), 201)
        ).self.id;
      }
      await db.pvpProfile.update({
        where: { id: operator.profileId },
        data: { score: 20, compromises: 2 },
      });
      await db.inventoryItem.create({
        data: {
          userId: (
            await db.pvpProfile.findUniqueOrThrow({
              where: { id: operator.profileId },
            })
          ).userId,
          sku: "ssd",
          state: "EQUIPPED",
        },
      });
      await act(operator, { type: "install", tool: "firewall" });
      const initial = await state(operator);
      assert.deepEqual(
        initial.peers.map((peer) => peer.id),
        [bogota.profileId],
      );
      assert.equal(initial.self?.equipment?.[0], "ssd");
      await act(bogota, {
        type: "link.open",
        targetId: operator.profileId,
        protocol: "tcp",
        port: 80,
      });
      const socket = await observe(bogota);
      try {
        const destination = { regionId: "tokio", arenaVisit: 0 };
        assert.equal(
          (await request(operator, "transfer", destination)).status,
          409,
        );
        const invalidation = update(socket);
        const moved = await read<PvpJoinResult>(
          await request(operator, "transfer", {
            ...destination,
            alias: "M6-Visitante",
          }),
        );
        await invalidation;
        assert.equal(moved.granted, false);
        assert.equal(moved.self.id, operator.profileId);
        assert.equal(moved.self.regionId, "tokio");
        assert.equal(moved.self.arenaVisit, 1);
        assert.equal(moved.self.balanceSats, initial.self?.balanceSats);
        assert.equal(moved.self.ipv4, initial.self?.ipv4);
        assert.notEqual(moved.self.address, initial.self?.address);
        assert.equal(moved.self.score, 0);
        assert.deepEqual(moved.self.config, initial.self?.config);
        assert.deepEqual(
          (await state(operator)).peers.map((peer) => peer.id),
          [tokio.profileId],
        );
        assert.equal((await state(operator)).self?.equipment?.[0], "ssd");
        assert.deepEqual(
          (await state(operator)).events.map((event) => event.kind),
          ["transfer"],
        );
        const left = await state(bogota);
        assert.equal(left.peers.length, 0);
        assert.match(left.links[0]?.reason ?? "", /cambió de arena/);
        assert.equal(
          (
            await request(operator, "action", {
              requestId: randomUUID(),
              arenaVisit: 0,
              action: { type: "service", service: "web", open: false },
            })
          ).status,
          409,
        );
        const retried = await read<PvpJoinResult>(
          await request(operator, "transfer", destination),
        );
        assert.equal(retried.self.arenaVisit, 1);
        const returned = await read<PvpJoinResult>(
          await request(operator, "transfer", {
            regionId: "bogota",
            arenaVisit: 1,
          }),
        );
        assert.equal(returned.self.score, 20);
        assert.equal(returned.self.compromises, 2);
        const previous = (await state(operator)).events.find(
          (event) => event.kind === "join",
        );
        assert.equal(previous?.archived, true);
        assert.equal(
          await db.walletEntry.count({
            where: { user: { pvpProfile: { id: operator.profileId } } },
          }),
          1,
        );
        const world = await read<WorldState>(
          await fetch(first.base + "/api/world"),
        );
        assert.equal(
          world.regions.find((region) => region.id === "bogota")?.devices,
          2,
        );
        assert.equal(
          world.regions.find((region) => region.id === "tokio")?.devices,
          1,
        );
      } finally {
        socket.terminate();
      }
    });

    it("cuts virtual links on close, filtering and patch, then admits a new patched connection", async () => {
      const client = await guest(first.base);
      const host = await guest(second.base);
      client.profileId = (
        await read<PvpJoinResult>(
          await deploy(client, "tokio", "M6-Cliente"),
          201,
        )
      ).self.id;
      host.profileId = (
        await read<PvpJoinResult>(await deploy(host, "tokio", "M6-Portal"), 201)
      ).self.id;
      const connect = () =>
        act(client, {
          type: "link.open",
          targetId: host.profileId,
          protocol: "tcp",
          port: 80,
        });
      assert.equal((await connect()).outcome, "ok");
      await act(host, { type: "service", service: "web", open: false });
      assert.match(
        (await state(client)).links[0]?.reason ?? "",
        /dejó de escuchar/,
      );
      assert.equal((await connect()).ports?.[0]?.state, "closed");
      await act(host, { type: "service", service: "web", open: true });
      assert.equal((await connect()).outcome, "ok");
      await act(host, { type: "install", tool: "firewall" });
      await act(host, { type: "policy", policy: "drop" });
      assert.equal((await connect()).ports?.[0]?.state, "filtered");
      assert.match(
        (await state(client)).links[0]?.reason ?? "",
        /filtra el enlace/,
      );
      await act(host, { type: "policy", policy: "allow" });
      assert.equal((await connect()).outcome, "ok");
      await act(host, { type: "patch", service: "web" });
      const interrupted = await connect();
      assert.equal(interrupted.outcome, "blocked");
      assert.match(interrupted.message, /reinicio/);
      assert.match((await state(client)).links[0]?.reason ?? "", /reinicio/);
      advance(3001);
      assert.match((await connect()).ports?.[0]?.banner ?? "", /NullOS 1\.1/);
      const reconnected = await state(client);
      assert.equal(reconnected.links[0]?.closedAt, null);
      assert.ok(
        reconnected.events.some(
          (event) => event.kind === "link" && /reinicio/.test(event.message),
        ),
      );
    });
  },
);
