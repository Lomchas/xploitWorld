import "dotenv/config";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { PVP_TOOLS, type PvpToolId } from "@null-protocol/shared";
import { seedMissions } from "../src/game/campaign/seed";
import { isLinkedOperator } from "../src/lib/account";
import { hashToken, newSessionToken } from "../src/lib/session";
import { verifyWorldDatabase } from "../src/lib/mode";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error("Configura " + name + ".");
  return value;
};
const sourceUrl =
  process.env.LEGACY_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/nullprotocol";
const storyUrl = required("STORY_DATABASE_URL");
const arenaUrl = required("PVP_DATABASE_URL");
const identity = (address: string) => {
  const url = new URL(address);
  return [
    url.hostname.replace("localhost", "127.0.0.1"),
    url.port || "5432",
    url.pathname,
  ].join("/");
};
if (new Set([sourceUrl, storyUrl, arenaUrl].map(identity)).size !== 3)
  throw new Error(
    "El origen M6.4 y los dos destinos tienen que ser bases distintas.",
  );

const connect = (url: string) =>
  new PrismaClient({ datasources: { db: { url } } });
const source = connect(sourceUrl);
const story = connect(storyUrl);
const arena = connect(arenaUrl);
const folder = resolve(
  process.env.XWD_MIGRATION_DIRECTORY ?? "../../migracion-m64",
);
const journalPath = resolve(folder, "claims-private.json");
const arenaKinds = new Set([
  "starter",
  "reward-pvp",
  "service-hold",
  "service-pay",
  "service-refund",
  "service-fee",
]);
const storyKinds = new Set([
  "reward-practice",
  "reward-academy",
  "reward-duty",
  "shop-buy",
  "market-buy",
  "market-sale",
  "market-fee",
  "duplicate-refund",
]);
const max = (a: bigint, b: bigint) => (a > b ? a : b);

const json = (value: Prisma.JsonValue | null) =>
  value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);

interface Journal {
  id: string;
  source: string;
  claims: Record<string, { alias: string; claim: string }>;
  arenaIds: Record<string, string>;
  storyClaims: Record<string, string>;
}
async function migrationJournal(
  profiles: { userId: string; alias: string }[],
  guestIds: string[],
) {
  const sourceId = createHash("sha256")
    .update(identity(sourceUrl))
    .digest("hex");
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const existing = await readFile(journalPath, "utf8").catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    },
  );
  if (existing) {
    const saved = JSON.parse(existing) as Journal;
    if (
      saved.source !== sourceId ||
      Object.keys(saved.claims).length !== profiles.length ||
      profiles.some(
        (profile) => !Object.hasOwn(saved.claims, profile.userId),
      ) ||
      Object.keys(saved.storyClaims).length !== guestIds.length ||
      guestIds.some((id) => !Object.hasOwn(saved.storyClaims, id))
    )
      throw new Error("El origen cambió desde el inicio de la migración.");
    return saved;
  }
  const result: Journal = {
    id: randomUUID(),
    source: sourceId,
    storyClaims: Object.fromEntries(
      guestIds.map((id) => [id, "xwd_m65_" + newSessionToken()]),
    ),
    arenaIds: Object.fromEntries(
      profiles.map(({ userId }) => [userId, randomUUID()]),
    ),
    claims: Object.fromEntries(
      profiles.map(({ userId, alias }) => [
        userId,
        { alias, claim: "xwd_m65_" + newSessionToken() },
      ]),
    ),
  };
  await writeFile(journalPath, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return result;
}

async function snapshot() {
  return source.$transaction(
    async (tx) => {
      const version = await tx.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = '20261113000000_m64_exchange' AND finished_at IS NOT NULL) AS found`;
      if (!version[0]?.found)
        throw new Error("El origen debe tener las migraciones de M6.4.");
      // Raw selects for profiles avoid referencing the new hostname column in the old database.
      const profiles = await tx.$queryRaw<
        Prisma.PvpProfileGetPayload<object>[]
      >`SELECT * FROM pvp_profiles`;
      const [
        users,
        levels,
        progress,
        commands,
        entries,
        licenses,
        academy,
        campaign,
        items,
        wallet,
        duty,
        regions,
        arenaRecords,
        events,
        links,
        receipts,
        signals,
        merchants,
        offers,
        contracts,
        listings,
      ] = await Promise.all([
        tx.user.findMany(),
        tx.level.findMany(),
        tx.userProgress.findMany(),
        tx.command.findMany(),
        tx.workspaceEntry.findMany(),
        tx.academyLicense.findMany(),
        // M6.4 rows predate the archived bilingual reports.
        tx.$queryRaw<
          Prisma.AcademyProgressCreateManyInput[]
        >`SELECT * FROM academy_progress`,
        tx.campaignRun.findMany(),
        tx.inventoryItem.findMany(),
        tx.walletEntry.findMany(),
        tx.dutyAttempt.findMany(),
        tx.pvpRegion.findMany(),
        tx.pvpArenaRecord.findMany(),
        tx.pvpEvent.findMany(),
        tx.pvpLink.findMany(),
        tx.pvpReceipt.findMany(),
        tx.worldSignal.findMany(),
        tx.merchant.findMany(),
        tx.serviceOffer.findMany(),
        tx.serviceContract.findMany(),
        tx.marketListing.findMany({
          where: { state: "OPEN" },
          select: { itemId: true },
        }),
      ]);
      return {
        users,
        levels,
        progress,
        commands,
        entries,
        licenses,
        academy,
        campaign,
        items,
        wallet,
        duty,
        regions,
        profiles,
        arenaRecords,
        events,
        links,
        receipts,
        signals,
        merchants,
        offers,
        contracts,
        listings,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      timeout: 60_000,
    },
  );
}

async function checkDestination(
  db: PrismaClient,
  mode: "story" | "pvp",
  id: string,
) {
  await verifyWorldDatabase(db, mode);
  const [marker, count] = await Promise.all([
    db.worldIdentity.findUniqueOrThrow({ where: { id: 1 } }),
    db.user.count(),
  ]);
  if (marker.legacyImport === id) return false;
  if (marker.legacyImport || count)
    throw new Error(
      "El destino " +
        mode +
        " debe estar nuevo. Sus datos existentes se conservaron.",
    );
  return true;
}

async function main() {
  const data = await snapshot();
  const oldUsers = new Set(data.profiles.map(({ userId }) => userId));
  const journal = await migrationJournal(
    data.profiles,
    data.users.filter((user) => !isLinkedOperator(user)).map((user) => user.id),
  );
  const canImport = await Promise.all([
    checkDestination(story, "story", journal.id),
    checkDestination(arena, "pvp", journal.id),
  ]);
  const split = new Map<string, { story: bigint; arena: bigint }>();
  const entriesByUser = new Map<string, typeof data.wallet>();
  for (const row of data.wallet) {
    if (!arenaKinds.has(row.kind) && !storyKinds.has(row.kind))
      throw new Error("Movimiento M6.4 sin clasificación: " + row.kind);
    const entries = entriesByUser.get(row.userId) ?? [];
    if (!entries.length) entriesByUser.set(row.userId, entries);
    entries.push(row);
  }
  for (const user of data.users) {
    let formerStory = 0n;
    let formerArena = 0n;
    for (const row of entriesByUser.get(user.id) ?? []) {
      if (arenaKinds.has(row.kind)) formerArena += row.deltaSats;
      else formerStory += row.deltaSats;
    }
    if (formerStory + formerArena !== user.balanceSats)
      throw new Error(
        "El saldo M6.4 no coincide con el libro para " +
          user.id +
          ". Revisa el respaldo.",
      );
    const arenaSats = oldUsers.has(user.id)
      ? max(0n, user.balanceSats - max(formerStory, 0n))
      : 0n;
    split.set(user.id, {
      story: user.balanceSats - arenaSats,
      arena: arenaSats,
    });
  }
  const reserved = new Set(data.listings.map(({ itemId }) => itemId));
  const now = new Date();
  const splitWallet = (mode: "story" | "arena") => {
    const rows = data.wallet.filter(({ userId, kind }) =>
      mode === "arena"
        ? oldUsers.has(userId) && arenaKinds.has(kind)
        : !arenaKinds.has(kind),
    );
    const sums = new Map<string, bigint>();
    for (const row of rows)
      sums.set(row.userId, (sums.get(row.userId) ?? 0n) + row.deltaSats);
    for (const user of data.users) {
      if (mode === "arena" && !oldUsers.has(user.id)) continue;
      const deltaSats = split.get(user.id)![mode] - (sums.get(user.id) ?? 0n);
      if (deltaSats)
        rows.push({
          id: randomUUID(),
          userId: user.id,
          reference: "m65-opening",
          kind: "migration-opening",
          deltaSats,
          createdAt: now,
        });
    }
    return rows;
  };
  if (canImport[0]) {
    await story.$transaction(
      async (tx) => {
        await tx.user.createMany({
          data: data.users.map((user) => ({
            ...user,
            balanceSats: split.get(user.id)!.story,
          })),
        });
        await tx.migrationClaim.createMany({
          data: Object.entries(journal.storyClaims).map(([userId, claim]) => ({
            userId,
            token: hashToken(claim),
          })),
        });
        // Preserve level identifiers referenced by old saves.
        await tx.level.deleteMany();
        await tx.level.createMany({ data: data.levels });
        await tx.userProgress.createMany({ data: data.progress });
        await tx.command.createMany({ data: data.commands });
        await tx.workspaceEntry.createMany({ data: data.entries });
        await tx.academyLicense.createMany({ data: data.licenses });
        await tx.academyProgress.createMany({ data: data.academy });
        await tx.campaignRun.createMany({
          data: data.campaign.map((row) => ({
            ...row,
            grades: json(row.grades) as Prisma.InputJsonValue,
          })),
        });
        await tx.inventoryItem.createMany({
          data: data.items.map((row) => ({
            ...row,
            state:
              reserved.has(row.id) && row.state === "RESERVED"
                ? "READY"
                : row.state,
          })),
        });
        await tx.walletEntry.createMany({ data: splitWallet("story") });
        await tx.dutyAttempt.createMany({ data: data.duty });
        await tx.worldIdentity.update({
          where: { id: 1 },
          data: { legacyImport: journal.id },
        });
      },
      { timeout: 120_000 },
    );
  }
  await seedMissions(story);
  if (canImport[1]) {
    await arena.$transaction(
      async (tx) => {
        await tx.user.createMany({
          data: data.users
            .filter(({ id }) => oldUsers.has(id))
            .map((user) => ({
              ...user,
              id: journal.arenaIds[user.id]!,
              username: "legacy_" + journal.arenaIds[user.id]!,
              email: journal.arenaIds[user.id]! + "@migration.invalid",
              role: "GUEST",
              password: "!guest:" + newSessionToken(),
              balanceSats: split.get(user.id)!.arena,
            })),
        });
        await tx.migrationClaim.createMany({
          data: Object.entries(journal.claims).map(([userId, { claim }]) => ({
            userId: journal.arenaIds[userId]!,
            token: hashToken(claim),
          })),
        });
        for (const region of data.regions)
          await tx.pvpRegion.upsert({
            where: { id: region.id },
            create: region,
            update: region,
          });
        await tx.pvpProfile.createMany({
          data: data.profiles.map((row) => ({
            ...row,
            userId: journal.arenaIds[row.userId]!,
            hostname: row.alias.toLowerCase().replaceAll("_", "-") + "-lab",
            config: {
              ...(row.config as Prisma.InputJsonObject),
              tools: Object.keys(PVP_TOOLS) as PvpToolId[],
            },
          })),
        });
        await tx.pvpArenaRecord.createMany({ data: data.arenaRecords });
        await tx.pvpEvent.createMany({
          data: data.events.map((row) => ({
            ...row,
            data: json(row.data) as Prisma.InputJsonValue,
          })),
        });
        await tx.pvpLink.createMany({ data: data.links });
        await tx.pvpReceipt.createMany({
          data: data.receipts.map((row) => ({
            ...row,
            result: json(row.result) as Prisma.InputJsonValue,
          })),
        });
        await tx.worldSignal.createMany({ data: data.signals });
        await tx.merchant.createMany({ data: data.merchants });
        await tx.serviceOffer.createMany({ data: data.offers });
        await tx.serviceContract.createMany({
          data: data.contracts.map((row) => ({
            ...row,
            scope: json(row.scope),
          })),
        });
        await tx.walletEntry.createMany({
          data: splitWallet("arena").map((row) => ({
            ...row,
            userId: journal.arenaIds[row.userId]!,
          })),
        });
        await tx.$queryRaw`SELECT setval(pg_get_serial_sequence('pvp_profiles', 'addressNumber'),
        COALESCE((SELECT max("addressNumber") FROM pvp_profiles), 1), EXISTS (SELECT 1 FROM pvp_profiles))`;
        await tx.$queryRaw`SELECT setval(pg_get_serial_sequence('pvp_events', 'ordinal'),
        COALESCE((SELECT max(ordinal) FROM pvp_events), 1), EXISTS (SELECT 1 FROM pvp_events))`;
        await tx.worldIdentity.update({
          where: { id: 1 },
          data: { legacyImport: journal.id },
        });
      },
      { timeout: 120_000 },
    );
  }
  console.log(
    `Historia: ${data.users.length} cuentas, ${data.progress.length} avances, ${data.entries.length} archivos.`,
  );
  console.log(
    `PvP: ${data.profiles.length} dispositivos, ${data.contracts.length} contratos. Códigos privados: ${journalPath}`,
  );
  const linked = data.users.filter(isLinkedOperator).length;
  console.log(
    `${linked} cuentas de Historia recuperables con sus claves anteriores. Conserva el respaldo M6.4.`,
  );
}
void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() =>
    Promise.all([
      source.$disconnect(),
      story.$disconnect(),
      arena.$disconnect(),
    ]),
  );
