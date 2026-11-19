import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import {
  CAMPAIGN_MISSIONS,
  MISSIONS,
  SATS_PER_BTC,
  STORY_EQUIPMENT,
  TUTORIAL_MISSIONS,
  WORKSPACE_ROOT,
} from "@null-protocol/shared";
import type { PrismaClient } from "@prisma/client";
import { createTestDatabase } from "./helpers/database";
import { ExchangeService } from "../src/exchange/service";
import { createApp } from "../src/app";
import { ARCHIVO } from "../src/game/campaign/archivo";
import { BRANCH_SCENES } from "../src/game/campaign/branches";
import { DIRECTOR_ALIAS, finalScenes } from "../src/game/campaign/final";
import { HIELO } from "../src/game/campaign/hielo";
import { MERCADO } from "../src/game/campaign/mercado";
import { OLVIDO } from "../src/game/campaign/olvido";
import {
  campaignReport,
  certificateView,
  variantFor,
} from "../src/game/campaign/progress";
import type { Scene } from "../src/game/campaign/scene";
import { seedMissions } from "../src/game/campaign/seed";
import { CampaignSession } from "../src/game/campaign/session";
import { VANTA } from "../src/game/campaign/vanta";
import { VirtualShell } from "../src/game/shell";
import { WorkspaceService } from "../src/workspace/service";

const databaseUrl = process.env.TEST_DATABASE_URL;
const enabled = Boolean(databaseUrl) && process.env.NODE_ENV === "test";

describe("UNO campaign and virtual documents", { skip: !enabled }, () => {
  const schema = `null_test_${randomUUID().replaceAll("-", "")}`;
  let db: PrismaClient;
  let workspace: WorkspaceService;
  let userId: string;
  let player: CampaignSession;

  const newSession = (id = userId) =>
    new CampaignSession(db, id, new VirtualShell(), workspace);
  const run = async (raw: string, code = 0, session = player) => {
    const response = await session.execute(raw);
    assert.equal(response.exitCode, code, `${raw}\n${response.output}`);
    return response;
  };
  const notePath = (code: string) => `~/trabajo/uno/${code}.txt`;
  const stages: Record<string, Scene> = {
    ...VANTA,
    ...MERCADO,
    ...OLVIDO,
    ...ARCHIVO,
    ...HIELO,
  };
  const exercise = async (code: string, scene: Scene, includeBonus = false) => {
    if (scene.alias) {
      await run("cat director/acuse.txt", 1);
      await run("check", 1);
      await run("submit Xld_", 1);
      assert.match(
        (await run("submit " + DIRECTOR_ALIAS)).output,
        /Copia virtual/,
      );
      await run("check", 1);
    }
    for (const action of scene.commands ?? []) {
      if (typeof action === "string") await run(action);
      else await run(action.raw, action.exitCode);
    }
    if (scene.control) {
      for (const [setting, probe] of scene.control.checks) {
        await run(`set ${scene.control.name} ${setting}`);
        await run("test " + probe);
      }
    }
    if (scene.note) {
      const bonus = includeBonus
        ? (scene.grade?.bonus ?? []).flatMap((item) => item.terms)
        : [];
      const note = [...scene.note, ...bonus].join(" · ");
      await run(`echo "${note}" > ${notePath(code)}`);
    }
    const result = await run(scene.answer ? "check " + scene.answer : "check");
    assert.equal(result.progressChanged, true);
  };

  before(async () => {
    db = await createTestDatabase(databaseUrl!, schema);
    workspace = new WorkspaceService(db);
    const user = await db.user.create({
      data: {
        username: "cohorte",
        email: "cohorte@example.test",
        password: "fixture",
      },
    });
    userId = user.id;
    player = newSession();
  });

  after(async () => {
    if (!db) return;
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  });

  it("reseeds the previous checkpoints in place and starts a legacy account at its first new scene", async () => {
    const legacy = await db.user.create({
      data: {
        username: "archivista",
        email: "archivista@example.test",
        password: "fixture",
      },
    });
    const old = await db.level.create({
      data: {
        slug: "chapter-1-ciudad-borrada",
        name: "Vanta",
        description: "Versión previa",
        flag: "OLD-FLAG",
        orderIndex: 7,
      },
    });
    const complete = await db.userProgress.create({
      data: {
        userId: legacy.id,
        levelId: old.id,
        completed: true,
        completedAt: new Date(),
        attempts: 3,
      },
    });
    await workspace.mutate(legacy.id, {
      type: "write",
      path: WORKSPACE_ROOT + "/anterior.txt",
      text: "Evidencia de Vanta",
    });
    await seedMissions(db);
    await seedMissions(db);
    assert.equal(await db.level.count(), 66);
    assert.equal(
      (await db.level.findUniqueOrThrow({ where: { slug: old.slug } })).id,
      old.id,
    );
    assert.deepEqual(
      await db.userProgress.findUnique({ where: { id: complete.id } }),
      complete,
    );
    assert.match(
      (await run("cat ~/trabajo/anterior.txt", 0, newSession(legacy.id)))
        .output,
      /Evidencia de Vanta/,
    );
    const tutorials = await db.level.findMany({
      where: { slug: { in: TUTORIAL_MISSIONS.map(({ slug }) => slug) } },
    });
    await db.userProgress.createMany({
      data: [userId, legacy.id].flatMap((id) =>
        tutorials.map(({ id: levelId }) => ({
          userId: id,
          levelId,
          completed: true,
          completedAt: new Date(),
        })),
      ),
    });
    assert.match(
      (await run("mission continuar", 0, newSession(legacy.id))).output,
      /1\.01 · El contrato/,
    );
  });

  it("creates, overwrites and atomically appends documents across console sessions", async () => {
    await run("mkdir ~/trabajo/uno");
    await run('echo "línea > literal" > "~/trabajo/uno/mi nota.txt"');
    await run('echo "reemplazo" > "~/trabajo/uno/mi nota.txt"');
    const second = newSession();
    await run("cd ~/trabajo/uno", 0, second);
    await Promise.all([
      run('echo "primera" >> "~/trabajo/uno/mi nota.txt"'),
      run('echo "segunda" >> "mi nota.txt"', 0, second),
    ]);
    const saved = await workspace.text(
      userId,
      WORKSPACE_ROOT + "/uno/mi nota.txt",
    );
    assert.match(saved.text, /^reemplazo\n/);
    assert.deepEqual(saved.text.trim().split("\n").slice(1).sort(), [
      "primera",
      "segunda",
    ]);
    assert.equal(
      (await run('cat "mi nota.txt"', 0, second)).output,
      saved.text.trimEnd(),
    );
    await run('chmod 400 "~/trabajo/uno/mi nota.txt"');
    await run('echo "bloqueado" >> "~/trabajo/uno/mi nota.txt"', 1);
    await run('echo "bloqueado" > /etc/hostname', 1);
    await run('echo "bloqueado" > ~/trabajo/../README.txt', 1);
    await run('echo -n "sin salto" > ~/trabajo/uno/compacta.txt');
    assert.equal(
      (await workspace.text(userId, WORKSPACE_ROOT + "/uno/compacta.txt")).text,
      "sin salto",
    );
  });

  it("plays every scene, the three secondary routes and the final alias in order", async () => {
    await run("mission 6.10", 1);
    await run("branch eco-7", 1);
    await run("submit " + DIRECTOR_ALIAS, 1);
    assert.match(
      (await run("mission continuar")).output,
      /1\.01 · El contrato/,
    );
    await run("check", 1);
    await run("cat contrato.txt");
    await run("check", 1);
    await run("echo vacía > " + notePath("1.01"));
    await run("check", 1);

    const allScenes = { ...stages, ...finalScenes(variantFor(userId, 0)) };
    assert.equal(Object.keys(allScenes).length, 60);
    const exchange = new ExchangeService(db);
    await exchange.execute(userId, randomUUID(), {
      type: "reward.claim",
      reward: "training",
    });
    for (const mission of CAMPAIGN_MISSIONS) {
      const item = STORY_EQUIPMENT[mission.code];
      if (item) {
        const blocked = await run("mission " + mission.code, 1);
        assert.equal(blocked.requiredItem, item);
        assert.equal(
          (await exchange.state(userId)).storyRequirement?.sku,
          item,
        );
        // The separate duty test covers earnings for a profile without a device.
        await db.user.update({
          where: { id: userId },
          data: { balanceSats: 120n * SATS_PER_BTC },
        });
        await exchange.execute(userId, randomUUID(), {
          type: "shop.buy",
          sku: item,
        });
        assert.equal((await exchange.state(userId)).deployed, false);
      }
      assert.match(
        (await run("mission " + mission.code)).output,
        new RegExp(mission.code.replace(".", "\\.")),
      );
      const scene = allScenes[mission.code]!;
      if (mission.code === "3.03") {
        await run("set informes archivistas");
        await run("test visitante");
        await run("check", 1);
        await run("mission 3.03");
      }
      await exercise(mission.code, scene);
      const side =
        mission.code === "1.07"
          ? "eco-7"
          : mission.code === "2.09"
            ? "bruma"
            : mission.code === "5.02"
              ? "espejos"
              : null;
      if (side) {
        await run("branch " + side);
        await exercise(side, BRANCH_SCENES[side]);
      }
    }
    assert.equal(
      await db.userProgress.count({ where: { userId, completed: true } }),
      MISSIONS.length,
    );
    const runState = await db.campaignRun.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(campaignReport(runState).score, 75);
    assert.equal(certificateView(runState), null);
    assert.match(
      (await run("epilogo", 0, newSession())).output,
      /Bogotá asume la primera guardia/,
    );
  });

  it("issues a certificate on improvement and preserves it across variants", async () => {
    const v = variantFor(userId, 0);
    const scenes = finalScenes(v);
    await run("mission 6.01");
    await run("cat autorizacion.txt");
    await run("cat inventario.txt");
    await run(
      'echo "Dependencia: canal de coordinación" >> ' + notePath("6.01"),
    );
    await run("check");
    const stale = newSession();
    await run("mission 6.01", 0, stale);
    await run("cat autorizacion.txt", 0, stale);
    await run("cat inventario.txt", 0, stale);
    await run("mission continuar");
    await exercise("6.10", scenes["6.10"]!);
    const first = await db.campaignRun.findUniqueOrThrow({ where: { userId } });
    const certificate = certificateView(first);
    assert.equal(certificate?.score, 80);
    assert.equal(certificate?.variant, v.id);
    assert.match(
      (await run("certificado", 0, newSession())).output,
      /XWD-[A-F0-9]{24}/,
    );
    const next = variantFor(userId, 1);
    assert.notEqual(next.id, v.id);
    assert.ok((await run("certificado repetir")).output.includes(next.id));
    assert.match((await run("check", 1, stale)).output, /otra variante activa/);
    const second = await db.campaignRun.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(campaignReport(second).score, 0);
    assert.deepEqual(certificateView(second), certificate);
    for (const attempt of [1, 2]) {
      const variant = variantFor(userId, attempt);
      if (attempt === 2)
        assert.ok(
          (await run("certificado repetir")).output.includes(variant.id),
        );
      for (const [code, scene] of Object.entries(finalScenes(variant))) {
        await run("mission " + code);
        await exercise(code, scene, true);
      }
      const graded = await db.campaignRun.findUniqueOrThrow({
        where: { userId },
      });
      assert.equal(campaignReport(graded).score, 100);
      assert.deepEqual(certificateView(graded), certificate);
    }
    assert.equal(
      await db.userProgress.count({ where: { userId, completed: true } }),
      66,
    );
  });

  it("verifies the issued certificate by code", async () => {
    const issued = certificateView(
      await db.campaignRun.findUnique({ where: { userId } }),
    );
    assert.ok(issued);
    const http = createServer(
      createApp(db, { allowedOrigins: [], production: false }),
    );
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    try {
      const address = http.address();
      assert.ok(address && typeof address === "object");
      const url = `http://127.0.0.1:${address.port}/api/campaign/certificates/`;
      const verified = await fetch(url + issued.code);
      assert.equal(verified.status, 200);
      assert.deepEqual(await verified.json(), issued);
      assert.equal((await fetch(url + "XWD-" + "0".repeat(24))).status, 404);
    } finally {
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  });
});
