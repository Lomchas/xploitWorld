import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { after, before, describe, it } from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  ARENA_WORKSPACE_ROOT,
  ATLAS_SITES,
  PVP_REGIONS,
  WORKSPACE_ROOT,
  pvpRegion,
  type ExchangeState,
  type PvpJoinResult,
  type PvpState,
  type WorldState,
} from "@null-protocol/shared";
import { WebSocket } from "ws";
import { createApp } from "../src/app";
import { initWsServer } from "../src/ws";
import { verifyWorldDatabase, type GameMode } from "../src/lib/mode";
import { hashToken } from "../src/lib/session";
import { createTestDatabase } from "./helpers/database";

const database = process.env.TEST_DATABASE_URL;
type World = {
  mode: GameMode;
  db: PrismaClient;
  schema: string;
  port: number;
  server: Server;
  socket: ReturnType<typeof initWsServer>;
};
let story: World;
let arena: World;
const origin = (world: World) => "http://127.0.0.1:" + world.port;
const ask = (world: World, path: string, cookie?: string, body?: object) =>
  fetch(origin(world) + path, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
  });
const action = (world: World, cookie: string, input: object) =>
  ask(
    world,
    (world.mode === "pvp" ? "/api/contracts" : "/api/exchange") + "/actions",
    cookie,
    { requestId: randomUUID(), action: input },
  );

async function world(mode: GameMode): Promise<World> {
  const schema = "null_test_" + randomUUID().replaceAll("-", "");
  const db = await createTestDatabase(database!, schema);
  await db.worldIdentity.create({ data: { id: 1, mode } });
  const server = createServer(
    createApp(db, { mode, allowedOrigins: [], production: false }),
  );
  const socket = initWsServer(server, db, [], [], mode);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server has no port");
  return { mode, schema, db, port: address.port, server, socket };
}
async function guest(target: World) {
  const response = await ask(target, "/api/session", undefined, {});
  assert.equal(response.status, 201);
  return {
    cookie: response.headers.get("set-cookie")!.split(";")[0]!,
    id: ((await response.json()) as { user: { id: string } }).user.id,
  };
}
const creds = (username: string) => ({
  username,
  key: "xwd_" + randomUUID().replaceAll("-", "").repeat(2),
});
const allowed = (status: number) => status === 200 || status === 201;

describe("Independent Story and Arena runtime", { skip: !database }, () => {
  before(async () => {
    story = await world("story");
    arena = await world("pvp");
  });
  after(async () => {
    for (const target of [story, arena]) {
      if (!target) continue;
      for (const peer of target.socket.clients) peer.terminate();
      target.socket.close();
      if (target.server.listening)
        await new Promise<void>((done) => target.server.close(() => done()));
      await target.db.$executeRawUnsafe(
        'DROP SCHEMA IF EXISTS "' + target.schema + '" CASCADE',
      );
      await target.db.$disconnect();
    }
  });

  it("separates session cookies, routes, websocket messages and files", async () => {
    const a = await guest(story);
    const b = await guest(arena);
    const c = await guest(arena);
    assert.notEqual(a.id, b.id);
    assert.match(a.cookie, /^xwd_story_session=/);
    assert.match(b.cookie, /^xwd_pvp_session=/);
    assert.equal((await ask(arena, "/api/account", a.cookie)).status, 401);
    assert.equal((await ask(story, "/api/account", b.cookie)).status, 401);
    assert.equal(
      (
        await ask(
          arena,
          "/api/account",
          a.cookie.replace("xwd_story", "xwd_pvp"),
        )
      ).status,
      401,
    );
    for (const path of [
      "/api/progress",
      "/api/levels",
      "/api/academy",
      "/api/exchange",
    ]) {
      assert.equal((await ask(arena, path, b.cookie)).status, 404, path);
    }
    for (const path of ["/api/pvp/state", "/api/world", "/api/contracts"]) {
      assert.equal((await ask(story, path, a.cookie)).status, 404, path);
    }
    const file = (root: string) => root + "/nota.txt";
    const read = (root: string) =>
      "/api/workspace/text?path=" + encodeURIComponent(file(root));
    assert.equal(
      (
        await ask(story, "/api/workspace/entries", a.cookie, {
          type: "write",
          path: file(WORKSPACE_ROOT),
          text: "solo Historia",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await ask(arena, "/api/workspace/entries", b.cookie, {
          type: "write",
          path: file(ARENA_WORKSPACE_ROOT),
          text: "solo Arena",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        (await (await ask(story, read(WORKSPACE_ROOT), a.cookie)).json()) as {
          text: string;
        }
      ).text,
      "solo Historia",
    );
    assert.equal(
      (
        (await (
          await ask(arena, read(ARENA_WORKSPACE_ROOT), b.cookie)
        ).json()) as { text: string }
      ).text,
      "solo Arena",
    );
    assert.equal(
      (await ask(arena, read(ARENA_WORKSPACE_ROOT), c.cookie)).status,
      404,
    );
    assert.equal(
      (await ask(story, read(ARENA_WORKSPACE_ROOT), a.cookie)).status,
      400,
    );
    assert.equal(
      (await ask(arena, read(WORKSPACE_ROOT), b.cookie)).status,
      400,
    );
    const ws = new WebSocket("ws://127.0.0.1:" + arena.port + "/ws", {
      headers: { Cookie: b.cookie },
    });
    await once(ws, "open");
    const result = once(ws, "message");
    ws.send(
      JSON.stringify({
        id: "case",
        type: "cmd",
        payload: { raw: "mission continuar", locale: "es" },
      }),
    );
    const [data] = await result;
    assert.equal(JSON.parse(String(data)).type, "error");
    ws.close();
    await assert.rejects(verifyWorldDatabase(arena.db, "story"));
  });

  it("buys Story equipment and settles an Arena contract without a Story prerequisite", async () => {
    const shopper = await guest(story);
    const buyer = await guest(arena);
    const seller = await guest(arena);
    await story.db.user.update({
      where: { id: shopper.id },
      data: { balanceSats: 40_00000000n },
    });
    assert.equal(
      (
        await action(story, shopper.cookie, {
          type: "shop.buy",
          sku: "workshop",
        })
      ).status,
      200,
    );
    assert.equal(
      (await action(arena, buyer.cookie, { type: "shop.buy", sku: "workshop" }))
        .status,
      404,
    );
    assert.equal(
      (
        await action(story, shopper.cookie, {
          type: "merchant.save",
          description: "Soporte",
        })
      ).status,
      404,
    );
    for (const [person, username] of [
      [buyer, "client"],
      [seller, "provider"],
    ] as const) {
      assert.ok(
        allowed(
          (
            await ask(
              arena,
              "/api/account/link",
              person.cookie,
              creds(username),
            )
          ).status,
        ),
      );
      const joined = await ask(arena, "/api/pvp/join", person.cookie, {
        regionId: "sa",
        alias: username,
        hostname: username + "-pc",
      });
      assert.equal(joined.status, 201);
      const result = (await joined.json()) as PvpJoinResult;
      assert.equal(result.self.hostname, username + "-pc");
      assert.equal(result.self.balanceSats, "2000000000");
      assert.ok(result.self.config.tools.includes("analyzer"));
    }
    assert.equal(
      (
        await action(arena, seller.cookie, {
          type: "merchant.save",
          description: "Soporte de redes del laboratorio.",
        })
      ).status,
      200,
    );
    const terms = {
      type: "service.offer",
      kind: "maintenance",
      title: "Parche portal",
      description: "Verificar y mantener el portal virtual autorizado.",
      price: "20",
      hours: 8,
    };
    const offered = await action(arena, seller.cookie, terms);
    assert.equal(offered.status, 200);
    const offerId = ((await offered.json()) as { id: string }).id;
    const available = (await (
      await ask(arena, "/api/contracts", buyer.cookie)
    ).json()) as ExchangeState;
    assert.equal(available.canTrade, true);
    assert.deepEqual(available.inventory, []);
    const offer = available.services.find(
      (row: { id: string }) => row.id === offerId,
    );
    assert.ok(offer);
    const hired = await action(arena, buyer.cookie, {
      type: "service.hire",
      id: offer.id,
      revision: offer.revision,
      service: "web",
    });
    assert.equal(hired.status, 200);
    const id = ((await hired.json()) as { id: string }).id;
    assert.equal(
      (
        await action(arena, seller.cookie, {
          type: "service.report",
          id,
          finding: "web",
          report:
            "El portal del cliente está abierto y su parche está pendiente.",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await action(arena, buyer.cookie, {
          type: "service.accept",
          id,
          rating: 5,
        })
      ).status,
      200,
    );
    const pvp = (await (
      await ask(arena, "/api/pvp/state", buyer.cookie)
    ).json()) as PvpState;
    assert.ok(pvp.self);
    assert.equal(pvp.self.config.services.web.patched, true);
    assert.equal(pvp.self.balanceSats, "0");
    assert.equal(await arena.db.userProgress.count(), 0);
    assert.equal(await arena.db.inventoryItem.count(), 0);
    assert.equal(await story.db.serviceContract.count(), 0);
    assert.equal(
      (await story.db.user.findUniqueOrThrow({ where: { id: shopper.id } }))
        .balanceSats,
      5_00000000n,
    );
  });

  it("recovers a migrated account once and only from its own world", async () => {
    const imported = await guest(arena);
    const visitor = await guest(arena);
    const claim = "xwd_m65_" + randomUUID().replaceAll("-", "").repeat(2);
    await arena.db.migrationClaim.create({
      data: { token: hashToken(claim), userId: imported.id },
    });
    const credentials = creds("migrated-arena");
    const path = "/api/account/migration";
    const body = { ...credentials, claim };
    assert.equal((await ask(story, path, undefined, body)).status, 409);
    const restored = await ask(arena, path, visitor.cookie, body);
    assert.equal(restored.status, 200);
    assert.deepEqual(await restored.json(), {
      user: { id: imported.id, username: credentials.username },
    });
    const cookie = restored.headers.get("set-cookie")!.split(";")[0]!;
    assert.match(cookie, /^xwd_pvp_session=/);
    assert.equal((await ask(arena, "/api/account", cookie)).status, 200);
    assert.equal(
      (await ask(arena, "/api/account", visitor.cookie)).status,
      401,
    );
    assert.equal((await ask(arena, path, undefined, body)).status, 409);
  });

  it("deploys capital arenas from the migration and closes connections on transfer", async () => {
    const rows = await arena.db.pvpRegion.findMany({ select: { id: true } });
    assert.deepEqual(
      new Set(rows.map(({ id }) => id)),
      new Set(PVP_REGIONS.map(({ id }) => id)),
    );
    assert.equal(new Set(ATLAS_SITES.map(({ country }) => country)).size, 197);
    assert.equal(
      new Set(PVP_REGIONS.map(({ network }) => network)).size,
      rows.length,
    );
    const a = await guest(arena);
    const b = await guest(arena);
    const join = async (cookie: string, alias: string) => {
      const result = await ask(arena, "/api/pvp/join", cookie, {
        regionId: "cap-st",
        alias,
        hostname: alias + "-pc",
      });
      assert.equal(result.status, 201);
      return ((await result.json()) as PvpJoinResult).self;
    };
    const origin = await join(a.cookie, "capital-a");
    const peer = await join(b.cookie, "capital-b");
    const prefix = "2001:db8:" + pvpRegion("cap-st").network + "::";
    assert.ok(origin.address.startsWith(prefix));
    assert.ok(peer.address.startsWith(prefix));
    assert.equal(pvpRegion("cap-st").linkLimit, 6);
    const open = (
      cookie: string,
      arenaVisit: number,
      targetId: string,
      protocol = "tcp",
      port = 80,
    ) =>
      ask(arena, "/api/pvp/action", cookie, {
        requestId: randomUUID(),
        arenaVisit,
        action: { type: "link.open", targetId, protocol, port },
      });
    const linked = await open(a.cookie, origin.arenaVisit, peer.id);
    assert.equal(linked.status, 200);
    const state = async (cookie: string) =>
      (await (await ask(arena, "/api/pvp/state", cookie)).json()) as PvpState;
    assert.equal((await state(b.cookie)).links[0]?.closedAt, null);
    const atlas = (await (await ask(arena, "/api/world")).json()) as WorldState;
    assert.equal(atlas.regions.find(({ id }) => id === "cap-st")?.online, 2);
    assert.ok(
      atlas.signals.some(
        (signal) => signal.region === "cap-st" && signal.kind === "LINK",
      ),
    );

    for (const [protocol, port] of [
      ["tcp", 80],
      ["tcp", 22],
      ["udp", 53],
    ] as const) {
      for (const [operator, from, to] of [
        [a, origin, peer],
        [b, peer, origin],
      ] as const) {
        assert.equal(
          (await open(operator.cookie, from.arenaVisit, to.id, protocol, port))
            .status,
          200,
        );
      }
    }
    const late = await guest(arena);
    const lateDevice = await join(late.cookie, "capital-late");
    const overLimit = await open(late.cookie, lateDevice.arenaVisit, origin.id);
    assert.equal(overLimit.status, 409);
    assert.match(await overLimit.text(), /límite de enlaces activos/);
    assert.equal(
      (await open(a.cookie, origin.arenaVisit, peer.id)).status,
      200,
    );

    const transfer = await ask(arena, "/api/pvp/transfer", a.cookie, {
      regionId: "cap-cl",
      arenaVisit: origin.arenaVisit,
    });
    assert.equal(transfer.status, 200);
    const moved = ((await transfer.json()) as PvpJoinResult).self;
    assert.equal(moved.id, origin.id);
    assert.equal(moved.balanceSats, origin.balanceSats);
    assert.notEqual(moved.address, origin.address);
    assert.equal(moved.regionId, "cap-cl");
    const former = await state(b.cookie);
    assert.equal(
      former.peers.some(({ id }) => id === origin.id),
      false,
    );
    assert.ok(former.links[0]?.closedAt);
    assert.deepEqual((await state(a.cookie)).peers, []);
  });

  it("isolates a capital's history from busy global activity and validates the arena query", async () => {
    await arena.db.worldSignal.createMany({
      data: [
        ...Array.from({ length: 31 }, () => ({
          regionId: "cap-no",
          actorId: "private-fixture-actor",
          rivalId: "private-fixture-rival",
          actorNode: 1,
          rivalNode: 2,
          kind: "LINK",
        })),
        ...Array.from({ length: 2 }, () => ({
          regionId: "cap-fj",
          actorId: "private-fixture-actor",
          rivalId: "private-fixture-rival",
          actorNode: 1,
          rivalNode: 2,
          kind: "SCAN",
          createdAt: new Date(Date.now() - 60_000),
        })),
      ],
    });
    const fetch = async (query = "") => {
      const response = await ask(arena, "/api/world" + query);
      assert.equal(response.status, 200);
      return (await response.json()) as WorldState;
    };
    const [global, quiet, busy, empty] = await Promise.all([
      fetch(),
      fetch("?arena=cap-fj"),
      fetch("?arena=cap-no"),
      fetch("?arena=cap-is"),
    ]);
    assert.equal(global.scope, undefined);
    assert.equal(quiet.scope, "cap-fj");
    assert.equal(quiet.signals.length, 2);
    assert.ok(quiet.signals.every((signal) => signal.region === "cap-fj"));
    assert.ok(
      quiet.signals.every(
        (signal) => !("actorId" in signal) && !("rivalId" in signal),
      ),
    );
    assert.equal(quiet.series.length, 12);
    assert.equal(
      quiet.series.reduce((sum, hour) => sum + hour.scans, 0),
      2,
    );
    assert.equal(
      quiet.series.reduce((sum, hour) => sum + hour.links, 0),
      0,
    );
    assert.equal(busy.signals.length, 30);
    assert.equal(
      busy.series.reduce((sum, hour) => sum + hour.links, 0),
      31,
    );
    assert.equal(
      empty.series.reduce((sum, hour) => sum + hour.scans + hour.links, 0),
      0,
    );
    assert.deepEqual(empty.signals, []);
    assert.deepEqual(quiet.regions, global.regions);
    assert.deepEqual(busy.regions, global.regions);

    const leaders = await arena.db.pvpProfile.findMany({
      where: { alias: { in: ["capital-a", "capital-b"] } },
    });
    for (const leader of leaders)
      await arena.db.pvpProfile.update({
        where: { id: leader.id },
        data: { score: 10 },
      });
    const localRank = await fetch("?arena=cap-cl");
    assert.deepEqual(
      localRank.ranking.map((leader) => leader.alias),
      ["capital-a"],
    );
    assert.equal(localRank.ranking[0]?.region, "cap-cl");
    for (const query of [
      "?arena=unknown",
      "?arena=",
      "?arena=cap-cl&arena=cap-st",
      "?arena[id]=cap-cl",
    ])
      assert.equal((await ask(arena, "/api/world" + query)).status, 400);
    assert.equal((await ask(story, "/api/world?arena=cap-cl")).status, 404);
  });
});
