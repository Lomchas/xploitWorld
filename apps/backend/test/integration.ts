import "dotenv/config";
import assert from "node:assert/strict";
import { before, after, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "./helpers/database";
import { WebSocket, type WebSocketServer } from "ws";
import { createApp } from "../src/app";
import { CASES } from "../src/academy/cases";
import { initWsServer } from "../src/ws";
import { hashToken } from "../src/lib/session";
import type {
  AccountState,
  AcademyCase,
  AcademyResult,
  AcademyState,
  CmdResponsePayload,
  PvpJoinResult,
  LevelSummary,
  FlagSubmission,
  UserProgressEntry,
  WorkspaceText,
} from "@null-protocol/shared";
import {
  ACADEMY_LESSONS,
  ACADEMY_TOOLS,
  WORKSPACE_ROOT,
} from "@null-protocol/shared";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl) && process.env.NODE_ENV === "test";
describe(
  "HTTP + WebSocket + Prisma integration",
  { skip: enabled ? false : "Set NODE_ENV=test and TEST_DATABASE_URL to run" },
  () => {
    const schema = `null_test_${randomUUID().replaceAll("-", "")}`;
    let db: PrismaClient;
    let http: Server;
    let wss: WebSocketServer;
    let base: string;
    let cookie: string;
    let levelId: string;
    let firstCompletion: string;
    const origin = "http://localhost:5173";
    before(async () => {
      db = await createTestDatabase(databaseUrl!, schema);
      const level = await db.level.create({
        data: {
          name: "Tutorial",
          slug: "level-1-basic-commands",
          description: "Encuentra la señal",
          difficulty: "EASY",
          flag: "TEST{signal}",
          orderIndex: 1,
        },
      });
      levelId = level.id;
      await db.level.create({
        data: {
          name: "Inactive",
          slug: "inactive",
          description: "Hidden",
          flag: "TEST{hidden}",
          isActive: false,
        },
      });
      http = createServer(
        createApp(db, { allowedOrigins: [origin], production: false }),
      );
      wss = initWsServer(http, db, [origin]);
      http.listen(0, "127.0.0.1");
      await once(http, "listening");
      const address = http.address();
      assert.ok(address && typeof address === "object");
      base = `http://127.0.0.1:${address.port}`;
    });
    after(async () => {
      if (wss) {
        for (const ws of wss.clients) ws.terminate();
        wss.close();
      }
      if (http) {
        http.closeIdleConnections();
        await new Promise<void>((resolve) => {
          http.close(() => resolve());
        });
      }
      if (db) {
        await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await db.$disconnect();
      }
    });
    const api = (
      path: string,
      options: RequestInit = {},
      session = cookie,
    ): Promise<Response> =>
      fetch(base + path, {
        ...options,
        headers: { Cookie: session ?? "", ...options.headers },
      });
    const submit = (flag: string): Promise<Response> =>
      api("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ levelId, flag }),
      });
    it("reports database health", async () => {
      assert.equal((await api("/health")).status, 200);
    });
    it("never exposes solution flags or inactive levels", async () => {
      const levels = (await (
        await api("/api/levels")
      ).json()) as LevelSummary[];
      assert.equal(levels.length, 1);
      assert.equal(Object.hasOwn(levels[0]!, "flag"), false);
      assert.equal(levels[0]!.orderIndex, 1);
      assert.equal((await api("/api/levels/inactive")).status, 404);
      const detail = (await (
        await api("/api/levels/level-1-basic-commands")
      ).json()) as LevelSummary;
      assert.equal(Object.hasOwn(detail, "flag"), false);
    });
    it("requires authentication for progress", async () => {
      assert.equal((await api("/api/progress", {}, "")).status, 401);
    });
    it("creates a guest with an HttpOnly opaque cookie and hashed database token", async () => {
      const response = await api("/api/session", { method: "POST" }, "");
      assert.equal(response.status, 201);
      const header = response.headers.get("set-cookie")!;
      assert.match(header, /HttpOnly/i);
      assert.match(header, /SameSite=Strict/i);
      cookie = header.split(";")[0]!;
      const raw = cookie.split("=")[1]!;
      assert.equal(await db.session.count({ where: { token: raw } }), 0);
      assert.equal(
        await db.session.count({ where: { token: hashToken(raw) } }),
        1,
      );
      const again = await api("/api/session", { method: "POST" });
      assert.equal(again.status, 200);
    });
    it("rejects forged user ids and client-controlled completion", async () => {
      const response = await api("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          levelId,
          flag: "TEST{signal}",
          userId: "another-user",
          completed: true,
        }),
      });
      assert.equal(response.status, 400);
    });
    it("records a failed attempt without completing the level", async () => {
      const result = (await (await submit("wrong")).json()) as FlagSubmission;
      assert.equal(result.accepted, false);
      assert.equal(result.progress.completed, false);
      assert.equal(result.progress.attempts, 1);
      assert.equal(result.progress.completedAt, null);
    });
    it("validates flags on the server and sets the first completion timestamp", async () => {
      const result = (await (
        await submit("TEST{signal}")
      ).json()) as FlagSubmission;
      assert.equal(result.accepted, true);
      assert.equal(result.progress.attempts, 2);
      assert.equal(result.progress.completed, true);
      assert.ok(result.progress.completedAt);
      firstCompletion = result.progress.completedAt;
      assert.equal(Object.hasOwn(result.progress.level, "flag"), false);
    });
    it("preserves completed progress during concurrent correct and wrong submissions", async () => {
      await Promise.all([
        submit("wrong"),
        submit("TEST{signal}"),
        submit("wrong"),
      ]);
      const progress = (await (
        await api("/api/progress")
      ).json()) as UserProgressEntry[];
      assert.equal(progress[0]!.completed, true);
      assert.equal(progress[0]!.attempts, 5);
      assert.equal(progress[0]!.completedAt, firstCompletion);
    });
    it("isolates progress between guest sessions", async () => {
      const response = await api("/api/session", { method: "POST" }, "");
      const other = response.headers.get("set-cookie")!.split(";")[0]!;
      assert.deepEqual(
        await (await api("/api/progress", {}, other)).json(),
        [],
      );
      const original = (await (
        await api("/api/progress")
      ).json()) as UserProgressEntry[];
      assert.equal(original.length, 1);
      assert.equal(
        (await api(`/api/progress/${original[0]!.userId}`, {}, other)).status,
        404,
      );
    });
    it("returns useful JSON errors for bad bodies and rejects untrusted origins", async () => {
      assert.equal(
        (
          await api("/api/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await api("/api/progress", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ levelId, flag: "x".repeat(10_000) }),
          })
        ).status,
        413,
      );
      assert.equal(
        (
          await api("/api/session", {
            method: "POST",
            headers: { Origin: "https://untrusted.invalid" },
          })
        ).status,
        403,
      );
    });
    const connect = async (sessionCookie = cookie): Promise<WebSocket> => {
      const ws = new WebSocket(base.replace("http:", "ws:") + "/ws", {
        headers: { Cookie: sessionCookie, Origin: origin },
      });
      await once(ws, "open");
      return ws;
    };
    const rejectedUpgrade = async (
      headers: Record<string, string>,
    ): Promise<number> => {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(base.replace("http:", "ws:") + "/ws", {
          headers,
        });
        ws.on("unexpected-response", (_req, response) => {
          response.resume();
          ws.terminate();
          resolve(response.statusCode ?? 0);
        });
        ws.on("error", () => {
          /* Expected after rejection. */
        });
        ws.on("open", () => {
          ws.terminate();
          reject(new Error("Unexpected upgrade"));
        });
      });
    };
    it("rejects anonymous and cross-origin WebSocket upgrades", async () => {
      assert.equal(await rejectedUpgrade({ Origin: origin }), 401);
      assert.equal(
        await rejectedUpgrade({
          Cookie: cookie,
          Origin: "https://untrusted.invalid",
        }),
        403,
      );
    });
    it("runs virtual commands over WebSocket, including the tutorial", async () => {
      const ws = await connect();
      try {
        const reply = once(ws, "message");
        ws.send(
          JSON.stringify({
            type: "cmd",
            payload: { raw: "cat .signal" },
            id: "tutorial",
          }),
        );
        const [data] = await reply;
        assert.deepEqual(JSON.parse(String(data)), {
          type: "cmd_response",
          id: "tutorial",
          payload: { output: "TEST{signal}", exitCode: 0, cwd: "/home/guest" },
        });
        const invalid = once(ws, "message");
        ws.send("null");
        assert.equal(JSON.parse(String((await invalid)[0])).type, "error");
      } finally {
        ws.close();
      }
    });
    it("limits command floods and oversized WebSocket frames", async () => {
      const ws = await connect();
      const close = once(ws, "close");
      for (let index = 0; index < 31; index++)
        ws.send('{"type":"ping","payload":null}');
      assert.equal((await close)[0], 1008);
      const large = await connect();
      const closed = once(large, "close");
      large.send("x".repeat(9000));
      assert.equal((await closed)[0], 1009);
    });
    it("revokes an existing WebSocket session on its next message", async () => {
      const response = await api("/api/session", { method: "POST" }, "");
      const otherCookie = response.headers.get("set-cookie")!.split(";")[0]!;
      const ws = await connect(otherCookie);
      const result = await api(
        "/api/session",
        { method: "DELETE" },
        otherCookie,
      );
      assert.equal(result.status, 204);
      const close = once(ws, "close");
      ws.send('{"type":"cmd","payload":{"raw":"pwd"}}');
      assert.equal((await close)[0], 1008);
    });
    it("links and restores the same PvP wallet across sessions without a second credit", async () => {
      const post = (body: object): RequestInit => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const deployed = await api(
        "/api/pvp/join",
        post({ regionId: "sa", alias: "Link-Test" }),
      );
      assert.equal(deployed.status, 201);
      const initial = (await deployed.json()) as PvpJoinResult;
      const credentials = {
        username: "link-test",
        key: "xwd_" + randomBytes(32).toString("hex"),
      };
      for (let retry = 0; retry < 2; retry++) {
        const linked = await api("/api/account/link", post(credentials));
        assert.equal(linked.status, 200);
        const account = (await linked.json()) as AccountState;
        assert.equal(account.linked, true);
        assert.equal(account.balanceSats, "2000000000");
        assert.equal(account.movements.length, 1);
        assert.equal(Object.hasOwn(account, "password"), false);
      }
      const denied = await api(
        "/api/account/login",
        post({ ...credentials, key: "xwd_" + "0".repeat(64) }),
        "",
      );
      assert.equal(denied.status, 401);
      const restored = await api("/api/account/login", post(credentials), "");
      assert.equal(restored.status, 200);
      const newCookie = restored.headers.get("set-cookie")!.split(";")[0]!;
      const again = await api(
        "/api/pvp/join",
        post({ regionId: "sa", alias: "Link-Test" }),
        newCookie,
      );
      assert.equal(again.status, 200);
      const reopened = (await again.json()) as PvpJoinResult;
      assert.equal(reopened.self.id, initial.self.id);
      assert.equal(reopened.granted, false);
      const profile = await db.pvpProfile.findUniqueOrThrow({
        where: { id: initial.self.id },
        include: { user: { include: { ledger: true } } },
      });
      assert.equal(profile.user.username, credentials.username);
      assert.equal(
        profile.user.password,
        "xwd-key:" + hashToken(credentials.key),
      );
      assert.equal(profile.user.ledger.length, 1);
      const progress = (await (
        await api("/api/progress", {}, newCookie)
      ).json()) as UserProgressEntry[];
      assert.equal(
        progress.some((entry) => entry.levelId === levelId && entry.completed),
        true,
      );
    });
    it("refuses expired sessions", async () => {
      await db.session.updateMany({
        where: { token: hashToken(cookie.split("=")[1]!) },
        data: { expiresAt: new Date(0) },
      });
      assert.equal((await api("/api/progress")).status, 401);
      assert.equal(
        await rejectedUpgrade({ Cookie: cookie, Origin: origin }),
        401,
      );
    });

    it("shares a private persistent workspace between shell and API and rejects stale edits", async () => {
      const guest = await api("/api/session", { method: "POST" }, "");
      const owner = guest.headers.get("set-cookie")!.split(";")[0]!;
      const stranger = (
        await api("/api/session", { method: "POST" }, "")
      ).headers
        .get("set-cookie")!
        .split(";")[0]!;
      const post = (body: unknown): RequestInit => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const folder = WORKSPACE_ROOT + "/informes";
      const path = folder + "/evidencia.txt";
      const image = folder + "/captura.png";
      const entry = (kind: string, target: string) =>
        `/api/workspace/${kind}?path=${encodeURIComponent(target)}`;
      const edit = (body: unknown) =>
        api("/api/workspace/entries", post(body), owner);
      const text = (session = owner) => api(entry("text", path), {}, session);
      const command = async (
        socket: WebSocket,
        raw: string,
      ): Promise<CmdResponsePayload> => {
        const id = randomUUID();
        const frame = once(socket, "message", {
          signal: AbortSignal.timeout(5000),
        });
        socket.send(JSON.stringify({ type: "cmd", payload: { raw }, id }));
        const [data] = await frame;
        const response = JSON.parse(String(data)) as {
          id: string;
          type: string;
          payload: CmdResponsePayload;
        };
        assert.equal(response.id, id);
        assert.equal(response.type, "cmd_response");
        return response.payload;
      };

      const shell = await connect(owner);
      try {
        assert.equal(
          (await command(shell, "mkdir ~/trabajo/informes")).exitCode,
          0,
        );
        assert.equal(
          (
            await command(
              shell,
              'write ~/trabajo/informes/evidencia.txt "Informe original"',
            )
          ).exitCode,
          0,
        );
        assert.equal(
          (await command(shell, 'write /etc/hostname "afuera"')).exitCode,
          1,
        );
        const original = (await (await text()).json()) as WorkspaceText;
        assert.equal(original.text, "Informe original");
        assert.equal((await text(stranger)).status, 404);
        assert.equal((await text("")).status, 401);

        const edits = await Promise.all(
          ["Hallazgo A", "Hallazgo B"].map((body) =>
            edit({
              type: "write",
              path,
              version: original.version,
              text: body,
            }),
          ),
        );
        assert.deepEqual(
          edits.map((response) => response.status).sort(),
          [200, 409],
        );
        const updated = (await (await text()).json()) as WorkspaceText;
        assert.match(updated.text, /^Hallazgo [AB]$/);
        assert.equal(
          (await command(shell, "cat ~/trabajo/informes/evidencia.txt")).output,
          updated.text,
        );
        assert.equal(
          (await command(shell, "chmod 000 ~/trabajo/informes")).exitCode,
          0,
        );
        assert.equal((await text()).status, 403);
        assert.equal(
          (await command(shell, "cat ~/trabajo/informes/evidencia.txt"))
            .exitCode,
          1,
        );
        assert.equal(
          (await edit({ type: "chmod", path: folder, mode: 0o700 })).status,
          200,
        );
        assert.equal(
          (await edit({ type: "remove", path: folder })).status,
          409,
        );
        assert.equal(
          (
            await edit({
              type: "write",
              path: WORKSPACE_ROOT + "/../fuera.txt",
              text: "x",
            })
          ).status,
          400,
        );

        const png = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE6sAAAAASUVORK5CYII=",
          "base64",
        );
        const upload = (body: Uint8Array) =>
          api(
            entry("image", image),
            {
              method: "PUT",
              headers: { "Content-Type": "image/png" },
              body: new Uint8Array(body),
            },
            owner,
          );
        assert.equal(
          (await upload(Buffer.from("contenido de texto"))).status,
          415,
        );
        assert.equal((await upload(png)).status, 201);
        const downloaded = await api(entry("image", image), {}, owner);
        assert.equal(downloaded.headers.get("content-type"), "image/png");
        assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), png);
        assert.equal(
          (await api(entry("image", image), {}, stranger)).status,
          404,
        );
        const hash = createHash("sha256").update(png).digest("hex");
        assert.match(
          (await command(shell, "sha256sum ~/trabajo/informes/captura.png"))
            .output,
          new RegExp("^" + hash),
        );
      } finally {
        shell.terminate();
      }
      const credentials = {
        username: "m6-archivo",
        key: "xwd_" + randomBytes(32).toString("hex"),
      };
      assert.equal(
        (await api("/api/account/link", post(credentials), owner)).status,
        200,
      );
      const login = await api("/api/account/login", post(credentials), "");
      assert.equal(login.status, 200);
      const restored = login.headers.get("set-cookie")!.split(";")[0]!;
      const reopened = await connect(restored);
      try {
        assert.match(
          (await command(reopened, "cat ~/trabajo/informes/evidencia.txt"))
            .output,
          /^Hallazgo [AB]$/,
        );
      } finally {
        reopened.terminate();
      }
    });

    it("preserves educational licenses and grades the complete Story curriculum", async () => {
      const guest = await api("/api/session", { method: "POST" }, "");
      const student = guest.headers.get("set-cookie")!.split(";")[0]!;
      const post = (body?: unknown): RequestInit => ({
        method: "POST",
        ...(body !== undefined
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      const academy = (path = "", options: RequestInit = {}) =>
        api("/api/academy" + path, options, student);
      const initial = (await (await academy()).json()) as AcademyState;
      assert.deepEqual(initial.installed, []);
      assert.equal(initial.progress.filter((row) => row.unlocked).length, 1);
      assert.equal((await api("/api/academy", {}, "")).status, 401);
      assert.equal(
        (await academy("/licenses/desconocida", post())).status,
        404,
      );
      assert.equal(
        (await academy("/lessons/incidente/prepare", post())).status,
        409,
      );
      assert.equal((await academy("/lessons/inventario")).status, 409);
      const activations = await Promise.all([
        academy("/licenses/nmap", post()),
        academy("/licenses/nmap", post()),
      ]);
      for (const response of activations) {
        assert.equal(response.status, 200);
        assert.deepEqual(((await response.json()) as AcademyState).installed, [
          "nmap",
        ]);
      }

      const attempted = new Set<string>();
      for (const { id } of ACADEMY_LESSONS) {
        const route = `/lessons/${id}`;
        assert.equal((await academy(route + "/prepare", post())).status, 200);
        const response = await academy(route);
        assert.equal(response.status, 200);
        const details = (await response.json()) as AcademyCase;
        assert.equal(details.review, null);
        assert.ok(details.evidence.length > 0);
        const expectedTools = ACADEMY_TOOLS.filter(
          (tool) => tool.lessonId === id,
        ).map((tool) => tool.id);
        assert.deepEqual(
          details.evidence.map((item) => item.toolId).sort(),
          expectedTools.sort(),
        );
        for (const item of details.evidence) {
          assert.ok(
            item.rows.every((row) => row.length === item.columns.length),
          );
          attempted.add(item.toolId);
        }
        assert.ok(details.questions.length >= 2);
        assert.ok(
          details.questions.every((item) => !Object.hasOwn(item, "answer")),
        );
        const answers = Object.fromEntries(
          CASES[id].checks.map((item) => [item.id, item.answer]),
        );
        if (id === "inventario") {
          assert.equal(
            (await academy(route + "/submit", post({ answers: {} }))).status,
            400,
          );
          const wrong = Object.fromEntries(
            CASES[id].checks.map((item) => [
              item.id,
              (item.answer + 1) % item.options.length,
            ]),
          );
          const denied = (await (
            await academy(route + "/submit", post({ answers: wrong }))
          ).json()) as AcademyResult;
          assert.equal(denied.accepted, false);
          assert.equal(denied.review, null);
          assert.ok(denied.feedback.every((row) => !row.correct));
          assert.equal(
            denied.state.progress.find((row) => row.id === "trafico")?.unlocked,
            false,
          );
          assert.equal(denied.state.progress[0]?.attempts, 1);
        }
        const graded = (await (
          await academy(route + "/submit", post({ answers }))
        ).json()) as AcademyResult;
        assert.equal(graded.accepted, true);
        assert.ok(graded.review);
        const finished = graded.state.progress.find((row) => row.id === id);
        assert.ok(finished?.completedAt);
        if (id === "inventario") {
          const repeated = (await (
            await academy(route + "/submit", post({ answers }))
          ).json()) as AcademyResult;
          assert.deepEqual(repeated.state.progress[0], finished);
          assert.equal(repeated.state.progress[1]?.unlocked, true);
        }
      }
      assert.equal(attempted.size, ACADEMY_TOOLS.length);
      const completed = (await (await academy()).json()) as AcademyState;
      assert.equal(
        completed.progress.filter((row) => row.completedAt).length,
        ACADEMY_LESSONS.length,
      );
      assert.equal(completed.installed.length, ACADEMY_TOOLS.length);

      const credentials = {
        username: "vanta-estudiante",
        key: "xwd_" + randomBytes(32).toString("hex"),
      };
      assert.equal(
        (await api("/api/account/link", post(credentials), student)).status,
        200,
      );
      const login = await api("/api/account/login", post(credentials), "");
      assert.equal(login.status, 200);
      const restored = login.headers.get("set-cookie")!.split(";")[0]!;
      const recovered = (await (
        await api("/api/academy", {}, restored)
      ).json()) as AcademyState;
      assert.deepEqual(recovered.progress, completed.progress);
      assert.deepEqual(
        new Set(recovered.installed),
        new Set(completed.installed),
      );
      const stranger = (
        await api("/api/session", { method: "POST" }, "")
      ).headers
        .get("set-cookie")!
        .split(";")[0]!;
      assert.deepEqual(
        (
          (await (
            await api("/api/academy", {}, stranger)
          ).json()) as AcademyState
        ).installed,
        [],
      );
      assert.equal(
        (await api("/api/academy/lessons/incidente", {}, stranger)).status,
        409,
      );
      assert.equal(
        (
          (await (
            await api("/api/account", {}, restored)
          ).json()) as AccountState
        ).balanceSats,
        "0",
      );
    });
  },
);
