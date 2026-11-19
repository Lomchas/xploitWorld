import { Prisma, type PrismaClient } from "@prisma/client";
import {
  isPvpRegionId,
  PVP_PRESENCE_MS,
  PVP_REGIONS,
  arenaNodes,
  type PvpRegionId,
  type SignalKind,
  type WorldState,
} from "@null-protocol/shared";

const HOUR = 3_600_000;
const KINDS: readonly string[] = ["SCAN", "PROBE", "COMPROMISE", "LINK"];

export async function readWorld(
  db: PrismaClient,
  now = new Date(),
  scope?: PvpRegionId,
): Promise<WorldState> {
  return db.$transaction(
    async (tx) => {
      const since = new Date(
        Math.floor(now.getTime() / HOUR) * HOUR - 11 * HOUR,
      );
      const region = scope ? { regionId: scope } : {};
      const [all, online, active, recent, scores, bins] = await Promise.all([
        tx.pvpProfile.groupBy({ by: ["regionId"], _count: { _all: true } }),
        tx.pvpProfile.groupBy({
          by: ["regionId"],
          _count: { _all: true },
          where: {
            lastSeenAt: { gte: new Date(now.getTime() - PVP_PRESENCE_MS) },
          },
        }),
        tx.worldSignal.groupBy({
          by: ["regionId"],
          _count: { _all: true },
          where: { createdAt: { gte: since } },
        }),
        tx.worldSignal.findMany({
          where: { ...region, createdAt: { gte: since } },
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 30,
          select: {
            id: true,
            regionId: true,
            actorNode: true,
            rivalNode: true,
            kind: true,
            createdAt: true,
          },
        }),
        tx.pvpProfile.findMany({
          where: { ...region, score: { gt: 0 } },
          select: {
            alias: true,
            regionId: true,
            score: true,
            compromises: true,
          },
          orderBy: [{ score: "desc" }, { compromises: "desc" }, { id: "asc" }],
          take: 10,
        }),
        tx.$queryRaw<{ hour: Date; kind: string; count: bigint }[]>(
          Prisma.sql`SELECT date_trunc('hour', "createdAt") AS hour, "kind",
            count(*) AS count FROM "world_signals"
            WHERE "createdAt" >= ${since}
            ${scope ? Prisma.sql`AND "regionId" = ${scope}` : Prisma.empty}
            GROUP BY 1, 2`,
        ),
      ]);
      const series = Array.from({ length: 12 }, (_, index) => {
        const hour = new Date(since.getTime() + index * HOUR).toISOString();
        const count = (kind: SignalKind) =>
          Number(
            bins.find(
              (bin) => bin.hour.toISOString() === hour && bin.kind === kind,
            )?.count ?? 0,
          );
        return {
          hour,
          scans: count("SCAN"),
          probes: count("PROBE"),
          compromises: count("COMPROMISE"),
          links: count("LINK"),
        };
      });
      const deviceCounts = new Map(
        all.map((row) => [row.regionId, row._count._all]),
      );
      const onlineCounts = new Map(
        online.map((row) => [row.regionId, row._count._all]),
      );
      const activityCounts = new Map(
        active.map((row) => [row.regionId, row._count._all]),
      );
      return {
        generatedAt: now.toISOString(),
        ...(scope ? { scope } : {}),
        regions: PVP_REGIONS.map(({ id }) => ({
          id,
          devices: deviceCounts.get(id) ?? 0,
          online: onlineCounts.get(id) ?? 0,
          activity: activityCounts.get(id) ?? 0,
        })),
        series,
        signals: recent.flatMap((row) => {
          if (!isPvpRegionId(row.regionId) || !KINDS.includes(row.kind))
            return [];
          const size = arenaNodes(row.regionId).length;
          const from = row.actorNode % size;
          const to = row.rivalNode % size;
          return [
            {
              id: row.id,
              region: row.regionId,
              from,
              to: to === from ? (to + 1) % size : to,
              kind: row.kind as SignalKind,
              createdAt: row.createdAt.toISOString(),
            },
          ];
        }),
        ranking: scores.flatMap((row) =>
          isPvpRegionId(row.regionId)
            ? [
                {
                  alias: row.alias,
                  region: row.regionId,
                  score: row.score,
                  compromises: row.compromises,
                },
              ]
            : [],
        ),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
