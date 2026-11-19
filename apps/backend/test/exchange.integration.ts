import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  MISSIONS,
  SERVICE_FEE_PERCENT,
  SATS_PER_BTC,
  type ExchangeAction,
} from "@null-protocol/shared";
import { createTestDatabase } from "./helpers/database";
import { ExchangeService } from "../src/exchange/service";
import { resolveDispute } from "../src/exchange/services";
import { parseExchangeAction } from "../src/exchange/validation";
import { readWorld } from "../src/game/observatory";
import { PvpService } from "../src/pvp/service";

const url = process.env.TEST_DATABASE_URL;
const enabled = !!url && process.env.NODE_ENV === "test";
describe("Transactional economy and observatory", { skip: !enabled }, () => {
  const schema = "null_test_" + randomUUID().replaceAll("-", "");
  let db: PrismaClient;
  let exchange: ExchangeService;
  let pvp: PvpService;
  let now = new Date("2026-11-09T12:00:00.000Z");
  const clock = () => now;
  const players = new Map<string, { userId: string; profileId: string }>();
  const player = (name: string) => players.get(name)!;
  const act = (name: string, action: ExchangeAction, key = randomUUID()) =>
    exchange.execute(player(name).userId, key, action);
  const balance = async (name: string) =>
    (
      await db.user.findUniqueOrThrow({
        where: { id: player(name).userId },
        select: { balanceSats: true },
      })
    ).balanceSats;

  before(async () => {
    db = await createTestDatabase(url!, schema);
    pvp = new PvpService(db, clock);
    exchange = new ExchangeService(db, clock);
    const levels = await Promise.all(
      MISSIONS.slice(0, 6).map((mission, index) =>
        db.level.create({
          data: {
            ...mission,
            orderIndex: index + 1,
            flag: "TEST{" + index + "}",
          },
        }),
      ),
    );
    for (const name of [
      "seller",
      "buyer-one",
      "buyer-two",
      "rival-three",
      "rival-four",
      "untrained",
      "guest",
    ]) {
      const user = await db.user.create({
        data: {
          username: name,
          email: name + "@test.invalid",
          role: name === "guest" ? "GUEST" : "PLAYER",
          password:
            name === "guest" ? "!guest:fixture" : "xwd-key:" + "a".repeat(64),
        },
      });
      const profile = (await pvp.join(user.id, "sa", name)).self;
      players.set(name, { userId: user.id, profileId: profile.id });
      if (name !== "guest")
        await db.user.update({
          where: { id: user.id },
          data: { balanceSats: 420n * SATS_PER_BTC },
        });
      if (name !== "untrained" && name !== "guest") {
        await db.userProgress.createMany({
          data: levels.map((level) => ({
            userId: user.id,
            levelId: level.id,
            completed: true,
            completedAt: now,
            attempts: 1,
          })),
        });
      }
    }
  });
  after(async () => {
    if (db) {
      await db.$executeRawUnsafe(
        'DROP SCHEMA IF EXISTS "' + schema + '" CASCADE',
      );
      await db.$disconnect();
    }
  });

  it("rejects forged prices and creates exactly one item and debit for a retried purchase", async () => {
    const id = randomUUID();
    assert.throws(() =>
      parseExchangeAction({
        requestId: id,
        action: { type: "shop.buy", sku: "cpu", price: "1" },
      }),
    );
    assert.throws(() =>
      parseExchangeAction({
        requestId: id,
        action: { type: "market.list", id: "a".repeat(25), price: "0.1" },
      }),
    );
    await assert.rejects(act("guest", { type: "shop.buy", sku: "cpu" }), {
      status: 409,
    });
    const results = await Promise.all([
      act("seller", { type: "shop.buy", sku: "cpu" }, id),
      act("seller", { type: "shop.buy", sku: "cpu" }, id),
    ]);
    assert.equal(results[0].id, results[1].id);
    await assert.rejects(act("seller", { type: "shop.buy", sku: "ssd" }, id), {
      status: 409,
    });
    assert.equal(await balance("seller"), 335n * SATS_PER_BTC);
    assert.equal(
      await db.inventoryItem.count({
        where: { userId: player("seller").userId },
      }),
      1,
    );
    const expensive = await act("untrained", { type: "shop.buy", sku: "ssd" });
    await assert.rejects(
      act("untrained", { type: "market.list", id: expensive.id!, price: "20" }),
      { status: 403 },
    );
    const before = await balance("untrained");
    await db.user.update({
      where: { id: player("untrained").userId },
      data: { balanceSats: 1n * SATS_PER_BTC },
    });
    await assert.rejects(act("untrained", { type: "shop.buy", sku: "cpu" }), {
      status: 409,
    });
    assert.equal(
      await db.inventoryItem.count({
        where: { userId: player("untrained").userId },
      }),
      1,
    );
    await db.user.update({
      where: { id: player("untrained").userId },
      data: { balanceSats: before },
    });
  });

  it("credits each practice objective once and caps confirmed PvP rewards by rival and UTC day", async () => {
    const before = await balance("seller");
    const key = randomUUID();
    await Promise.all([
      act("seller", { type: "reward.claim", reward: "training" }, key),
      act("seller", { type: "reward.claim", reward: "training" }, key),
    ]);
    await assert.rejects(
      act("seller", { type: "reward.claim", reward: "training" }),
      { status: 409 },
    );
    await assert.rejects(
      act("untrained", { type: "reward.claim", reward: "training" }),
      { status: 409 },
    );
    await db.worldSignal.createMany({
      data: [
        "buyer-one",
        "buyer-one",
        "buyer-two",
        "rival-three",
        "rival-four",
        "guest",
      ].map((name, index) => ({
        regionId: "sa",
        actorId: player("seller").profileId,
        rivalId: player(name).profileId,
        kind: "COMPROMISE",
        actorNode: 1,
        rivalNode: index + 2,
        createdAt: now,
      })),
    });
    await act("seller", { type: "reward.claim", reward: "rival" });
    await assert.rejects(
      act("seller", { type: "reward.claim", reward: "rival" }),
      { status: 409 },
    );
    assert.equal(await balance("seller"), before + 21n * SATS_PER_BTC);
    const payouts = await db.walletEntry.findMany({
      where: { userId: player("seller").userId, kind: "reward-pvp" },
    });
    assert.equal(payouts.length, 2);
    const paidRival = payouts[0]!.reference.split(":").at(-1)!;
    now = new Date(now.getTime() + 24 * 3_600_000);
    await assert.rejects(
      act("seller", { type: "reward.claim", reward: "rival" }),
      { status: 409 },
    );
    await db.worldSignal.create({
      data: {
        regionId: "sa",
        actorId: player("seller").profileId,
        rivalId: paidRival,
        kind: "COMPROMISE",
        actorNode: 1,
        rivalNode: 2,
        createdAt: now,
      },
    });
    await assert.rejects(
      act("seller", { type: "reward.claim", reward: "rival" }),
      { status: 409 },
    );
    now = new Date(now.getTime() + 7 * 86_400_000);
    await db.worldSignal.create({
      data: {
        regionId: "sa",
        actorId: player("seller").profileId,
        rivalId: paidRival,
        kind: "COMPROMISE",
        actorNode: 1,
        rivalNode: 2,
        createdAt: now,
      },
    });
    await act("seller", { type: "reward.claim", reward: "rival" });
    assert.equal(await balance("seller"), before + 27n * SATS_PER_BTC);
  });

  it("reserves and cancels an item, then assigns one winner and charges exactly two percent", async () => {
    const item = (await exchange.state(player("seller").userId)).inventory[0]!;
    const first = await act("seller", {
      type: "market.list",
      id: item.id,
      price: "50",
    });
    assert.equal(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .state,
      "RESERVED",
    );
    await assert.rejects(
      act("seller", { type: "inventory.equip", id: item.id }),
      { status: 409 },
    );
    await act("seller", { type: "market.cancel", id: first.id! });
    assert.equal(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .state,
      "READY",
    );
    const offer = await act("seller", {
      type: "market.list",
      id: item.id,
      price: "50",
    });
    await assert.rejects(act("seller", { type: "market.buy", id: offer.id! }), {
      status: 403,
    });
    const before = await balance("seller");
    const attempts = await Promise.allSettled([
      act("buyer-one", { type: "market.buy", id: offer.id! }),
      act("buyer-two", { type: "market.buy", id: offer.id! }),
    ]);
    assert.equal(
      attempts.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const owner =
      attempts[0].status === "fulfilled" ? "buyer-one" : "buyer-two";
    assert.equal(
      (await db.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .userId,
      player(owner).userId,
    );
    assert.equal(await balance(owner), 370n * SATS_PER_BTC);
    assert.equal(await balance("seller"), before + 49n * SATS_PER_BTC);
  });

  it("uses equipped effects in PvP and exposes only public signal summaries", async () => {
    const scanner = await act("seller", { type: "shop.buy", sku: "scanner" });
    await act("seller", { type: "inventory.equip", id: scanner.id! });
    const before = (await pvp.state(player("seller").userId, 0, "")).self!
      .energy;
    await pvp.act(player("seller").userId, randomUUID(), {
      type: "scan",
      targetId: player("buyer-one").profileId,
    });
    assert.equal(
      (await pvp.state(player("seller").userId, 0, "")).self!.energy,
      before - 2,
    );
    const world = await readWorld(db, now);
    assert.equal(world.regions.find((row) => row.id === "sa")?.devices, 7);
    assert.equal(
      world.series.reduce((sum, hour) => sum + hour.scans, 0),
      1,
    );
    const scan = world.signals.find((signal) => signal.kind === "SCAN")!;
    assert.ok(scan);
    assert.equal(
      "actorId" in scan || "rivalId" in scan || "data" in scan,
      false,
    );
    const charge = await act("seller", { type: "shop.buy", sku: "recovery" });
    await db.pvpProfile.update({
      where: { id: player("seller").profileId },
      data: { integrity: 50 },
    });
    await act("seller", { type: "inventory.use", id: charge.id! });
    const repaired = (await pvp.state(player("seller").userId, 0, "")).self!;
    assert.equal(repaired.integrity, 90);
    assert.equal(repaired.energy, before - 2);
    await assert.rejects(
      act("seller", { type: "inventory.use", id: charge.id! }),
      { status: 409 },
    );
  });

  it("quotes immutable terms, validates PvP evidence, settles disputes and records both sides", async () => {
    const buyer = "buyer-one";
    const seller = "seller";
    await act(seller, {
      type: "merchant.save",
      description: "Auditor de VNET.",
    });
    const params = {
      type: "service.offer",
      kind: "audit",
      title: "Auditoría del portal",
      description: "Informe de puertos virtuales.",
      price: "35",
      hours: 8,
    } as const;
    const offer = await act(seller, params);
    await act(seller, { ...params, price: "40" });
    const version = (await exchange.state(player(buyer).userId)).services.find(
      (item) => item.id === offer.id,
    )!.revision;
    await assert.rejects(
      act(buyer, {
        type: "service.hire",
        id: offer.id!,
        revision: version - 1,
      }),
      { status: 409 },
    );
    const startBuyer = await balance(buyer);
    const startSeller = await balance(seller);
    const contract = await act(buyer, {
      type: "service.hire",
      id: offer.id!,
      revision: version,
    });
    assert.equal(await balance(buyer), startBuyer - 40n * SATS_PER_BTC);
    assert.equal(await balance(seller), startSeller);
    await assert.rejects(
      act("buyer-two", { type: "service.accept", id: contract.id!, rating: 5 }),
      { status: 404 },
    );
    const job = (await exchange.state(player(seller).userId)).contracts.find(
      (item) => item.id === contract.id,
    )!;
    assert.equal(job.scope?.kind, "audit");
    assert.equal(job.description, params.description);
    assert.deepEqual(job.evidenceChoices, []);
    const report = {
      type: "service.report",
      id: contract.id!,
      finding: "listening",
      report:
        "El portal está configurado como abierto. Verificar la política de exposición.",
    } as const;
    await assert.rejects(act(buyer, report), { status: 409 });
    await assert.rejects(act(seller, { ...report, finding: "quiet" }), {
      status: 409,
    });
    await act(seller, report);
    await act(buyer, {
      type: "service.dispute",
      id: contract.id!,
      reason: "Revisar la evidencia.",
    });
    assert.equal(await balance(seller), startSeller);
    await resolveDispute(db, contract.id!, false, "Prueba de arbitraje");
    assert.equal(await balance(buyer), startBuyer);
    assert.equal(await balance(seller), startSeller);
    await assert.rejects(resolveDispute(db, contract.id!, true, "repetición"), {
      status: 404,
    });
    const next = await act(buyer, {
      type: "service.hire",
      id: offer.id!,
      revision: version,
    });
    await act(seller, { ...report, id: next.id! });
    const key = randomUUID();
    await act(buyer, { type: "service.accept", id: next.id!, rating: 5 }, key);
    await act(buyer, { type: "service.accept", id: next.id!, rating: 5 }, key);
    assert.equal(
      await balance(seller),
      startSeller +
        (40n * SATS_PER_BTC * BigInt(100 - SERVICE_FEE_PERCENT)) / 100n,
    );
    assert.equal(
      (await exchange.state(player(buyer).userId)).services.find(
        (item) => item.id === offer.id,
      )!.reputation,
      5,
    );
    assert.equal(
      (await exchange.state(player(seller).userId)).contracts.find(
        (row) => row.id === next.id,
      )!.state,
      "PAID",
    );
    const overdue = await act(buyer, {
      type: "service.hire",
      id: offer.id!,
      revision: version,
    });
    now = new Date(now.getTime() + 9 * 3_600_000);
    const settled = (await exchange.state(player(buyer).userId)).contracts.find(
      ({ id }) => id === overdue.id,
    );
    assert.equal(settled?.state, "REFUNDED");
    assert.equal(await balance(buyer), startBuyer - 40n * SATS_PER_BTC);
  });
  it("enforces unique items across concurrent shop and market purchases and buys charges as a batch", async () => {
    const duplicate = await Promise.allSettled([
      act("buyer-one", { type: "shop.buy", sku: "workshop" }),
      act("buyer-one", { type: "shop.buy", sku: "workshop" }),
    ]);
    assert.equal(
      duplicate.filter((row) => row.status === "fulfilled").length,
      1,
    );
    const sellerTool = await act("seller", {
      type: "shop.buy",
      sku: "workshop",
    });
    const listing = await act("seller", {
      type: "market.list",
      id: sellerTool.id!,
      price: "28",
    });
    await assert.rejects(act("seller", { type: "shop.buy", sku: "workshop" }), {
      status: 409,
    });
    await assert.rejects(
      act("buyer-one", { type: "market.buy", id: listing.id! }),
      { status: 409 },
    );
    const before = await balance("buyer-two");
    const id = randomUUID();
    const action = { type: "shop.buy", sku: "recovery", quantity: 3 } as const;
    const [first, second] = await Promise.all([
      act("buyer-two", action, id),
      act("buyer-two", action, id),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(await balance("buyer-two"), before - 60n * SATS_PER_BTC);
    assert.equal(
      await db.inventoryItem.count({
        where: { userId: player("buyer-two").userId, sku: "recovery" },
      }),
      3,
    );
    await assert.rejects(
      act("buyer-two", { type: "shop.buy", sku: "workshop", quantity: 2 }),
      { status: 400 },
    );
  });

  it("funds a guest from daily defensive cases, prevents replay and lets them buy without a device", async () => {
    const guest = await db.user.create({
      data: {
        username: "solo-duty",
        email: "solo-duty@test.invalid",
        password: "!guest:solo",
        role: "GUEST",
      },
    });
    const answers: Record<string, [string, string]> = {
      "La copia del catálogo": [
        "Respaldo B",
        "Comparar los datos restaurados con la muestra autorizada.",
      ],
      "El acceso del proveedor": [
        "Lectura del manual durante la intervención.",
        "La lectura funciona y un cambio de producción se deniega.",
      ],
      "El turno de medianoche": [
        "00:12 UTC",
        "La orden precede a la caída por cuatro minutos.",
      ],
      "El registro bajo custodia": [
        "La copia de trabajo verificada.",
        "Referencias y horas verificables, con los datos personales retirados.",
      ],
      "El parche de mantenimiento": [
        "Restaurar la consulta legítima y repetir ambas comprobaciones.",
        "Versión aplicada, control verificado y resultado del servicio.",
      ],
      "El canal de coordinación": [
        "Aislar el flujo afectado y verificar el canal por separado.",
        "El flujo afectado se detiene y el canal autorizado sigue disponible.",
      ],
    };
    const state = () => exchange.state(guest.id);
    for (let day = 0; day < 3; day++) {
      for (let stage = 0; stage < 3; stage++) {
        const work = (await state()).duty.next!;
        const expected = answers[work.title]!;
        const choice = work.questions.map((question, i) =>
          question.options.indexOf(expected[i]!),
        ) as [number, number];
        const action = {
          type: "duty.submit",
          id: work.id,
          answers: choice,
        } as const;
        if (day === 0 && stage === 0) {
          const wrong = await exchange.execute(guest.id, randomUUID(), {
            ...action,
            answers: [(choice[0] + 1) % 3, choice[1]],
          });
          assert.equal(wrong.accepted, false);
          assert.ok((await state()).duty.retryAt);
          await assert.rejects(
            exchange.execute(guest.id, randomUUID(), action),
            { status: 429 },
          );
          now = new Date(now.getTime() + 31_000);
        }
        const key = randomUUID();
        const result = await exchange.execute(guest.id, key, action);
        assert.equal(result.accepted, true);
        assert.deepEqual(await exchange.execute(guest.id, key, action), result);
        await assert.rejects(exchange.execute(guest.id, randomUUID(), action), {
          status: 409,
        });
      }
      assert.equal((await state()).duty.earned, 16);
      assert.equal((await state()).duty.next, null);
      now = new Date(now.getTime() + 86_400_000);
    }
    await exchange.execute(guest.id, randomUUID(), {
      type: "shop.buy",
      sku: "workshop",
    });
    const result = await state();
    assert.equal(result.balanceSats, (13n * SATS_PER_BTC).toString());
    assert.equal(result.deployed, false);
    assert.equal(result.inventory[0]?.sku, "workshop");
    assert.equal(
      (await exchange.state(player("seller").userId)).duty.next,
      null,
    );
    assert.equal(
      (await exchange.state(player("seller").userId)).duty.reserveReached,
      true,
    );
  });

  it("settles maintenance on the buyer's authorized service and refunds a redundant repair", async () => {
    const seller = "seller";
    const buyer = "buyer-two";
    const catalog = async (kind: "maintenance" | "recovery") => {
      const offer = await act(seller, {
        type: "service.offer",
        kind,
        title: kind === "maintenance" ? "Parche de portal" : "Restauración",
        description: "Trabajo documentado para el equipo del cliente.",
        price: "25",
        hours: 4,
      });
      return (await exchange.state(player(buyer).userId)).services.find(
        ({ id }) => id === offer.id,
      )!;
    };
    const offer = await catalog("maintenance");
    const job = await act(buyer, {
      type: "service.hire",
      id: offer.id,
      revision: offer.revision,
      service: "web",
    });
    const report = {
      type: "service.report",
      id: job.id!,
      finding: "web",
      report:
        "El portal de la copia de trabajo requiere una actualización aprobada.",
    } as const;
    await act(seller, report);
    const previous = await balance(seller);
    now = new Date(now.getTime() + 48 * 3_600_000);
    await Promise.all([
      exchange.state(player(buyer).userId),
      exchange.state(player(seller).userId),
    ]);
    const after = await pvp.state(player(buyer).userId, 0, "");
    assert.equal(after.self?.config.services.web.patched, true);
    assert.equal(after.self?.config.services.dns.patched, false);
    assert.equal(await balance(seller), previous + 23n * SATS_PER_BTC);
    assert.equal(
      (await exchange.state(player(buyer).userId)).contracts.find(
        ({ id }) => id === job.id,
      )?.state,
      "PAID",
    );

    const recovery = await catalog("recovery");
    await db.pvpProfile.update({
      where: { id: player(buyer).profileId },
      data: { integrity: 50 },
    });
    const buyerBalance = await balance(buyer);
    const repair = await act(buyer, {
      type: "service.hire",
      id: recovery.id,
      revision: recovery.revision,
    });
    await act(seller, { ...report, id: repair.id!, finding: "repair" });
    await db.pvpProfile.update({
      where: { id: player(buyer).profileId },
      data: { integrity: 100 },
    });
    await act(buyer, { type: "service.accept", id: repair.id!, rating: 5 });
    assert.equal(await balance(buyer), buyerBalance);
    assert.equal(
      (await exchange.state(player(buyer).userId)).contracts.find(
        ({ id }) => id === repair.id,
      )?.state,
      "REFUNDED",
    );

    await db.pvpProfile.update({
      where: { id: player(buyer).profileId },
      data: { integrity: 10 },
    });
    const nextRepair = await act(buyer, {
      type: "service.hire",
      id: recovery.id,
      revision: recovery.revision,
    });
    await act(seller, { ...report, id: nextRepair.id!, finding: "repair" });
    await act(buyer, { type: "service.accept", id: nextRepair.id!, rating: 5 });
    const repaired = await pvp.state(player(buyer).userId, 0, "");
    assert.equal(repaired.self?.integrity, 90);
    assert.equal(await balance(buyer), buyerBalance - 25n * SATS_PER_BTC);
    assert.ok(
      (await exchange.state(player(buyer).userId)).serviceAssets
        ?.recoveryAvailableAt,
    );
    await assert.rejects(
      act(buyer, {
        type: "service.hire",
        id: recovery.id,
        revision: recovery.revision,
      }),
      { status: 409 },
    );
    now = new Date(now.getTime() + 30 * 60_000);
    assert.equal(
      (await exchange.state(player(buyer).userId)).serviceAssets
        ?.recoveryAvailableAt,
      null,
    );
  });
});
