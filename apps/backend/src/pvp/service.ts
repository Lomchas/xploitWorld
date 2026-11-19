import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type PvpProfile } from "@prisma/client";
import {
  PVP_PAGE_SIZE,
  PVP_PRESENCE_MS,
  pvpRegion,
  PVP_STARTER_SATS,
  PVP_TOOLS,
  type PvpToolId,
  type PvpAction,
  type PvpActionResult,
  type PvpJoinResult,
  type PvpRegionId,
  type PvpState,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import { economyTransaction, moveBalance } from "../exchange/ledger";
import { executeTurn } from "./actions";
import { closeTravelLinks, readLinks } from "./links";
import { addressNumber, freshDevice } from "./network";
import {
  peerSelect,
  privateEvent,
  privateProfile,
  publicPeer,
  regionIdOf,
  toJson,
} from "./records";

const WRITE_TRANSACTION = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  timeout: 12_000,
};
export async function lockRegion(
  db: Prisma.TransactionClient,
  regionId: PvpRegionId,
): Promise<void> {
  // This UPDATE obtains the database row lock until commit, including across server processes.
  await db.pvpRegion.update({
    where: { id: regionId },
    data: { revision: { increment: 0 } },
    select: { id: true },
  });
}
async function bumpRegion(
  db: Prisma.TransactionClient,
  regionId: PvpRegionId,
): Promise<void> {
  await db.pvpRegion.update({
    where: { id: regionId },
    data: { revision: { increment: 1 } },
    select: { id: true },
  });
}

async function requireSlot(
  db: Prisma.TransactionClient,
  regionId: PvpRegionId,
): Promise<void> {
  const { capacity } = pvpRegion(regionId);
  if (
    capacity !== undefined &&
    (await db.pvpProfile.count({ where: { regionId } })) >= capacity
  )
    throw new HttpError(409, "La arena alcanzó su capacidad de dispositivos.");
}

export class PvpService {
  constructor(
    private readonly db: PrismaClient,
    private readonly clock: () => Date = () => new Date(),
    private readonly standalone = false,
  ) {}

  private rejoin(
    profile: PvpProfile & { user: { balanceSats: bigint } },
    regionId: PvpRegionId,
  ): PvpJoinResult {
    if (profile.regionId !== regionId)
      throw new HttpError(
        409,
        "Tu dispositivo ya está registrado en otra región. Vuelve a tu arena.",
      );
    return {
      self: privateProfile(profile, this.clock(), profile.user.balanceSats),
      granted: false,
    };
  }

  async join(
    userId: string,
    regionId: PvpRegionId,
    alias: string,
    hostname?: string,
  ): Promise<PvpJoinResult> {
    const include = { user: { select: { balanceSats: true } } } as const;
    const existing = await this.db.pvpProfile.findUnique({
      where: { userId },
      include,
    });
    if (existing) return this.rejoin(existing, regionId);
    const aliasKey = alias.toLowerCase();
    try {
      return await this.db.$transaction(async (tx) => {
        await lockRegion(tx, regionId);
        const current = await tx.pvpProfile.findUnique({
          where: { userId },
          include,
        });
        if (current) return this.rejoin(current, regionId);
        const duplicate = await tx.pvpProfile.findUnique({
          where: { regionId_aliasKey: { regionId, aliasKey } },
          select: { id: true },
        });
        if (duplicate)
          throw new HttpError(409, "Ese alias ya se usa en esta región.");
        await requireSlot(tx, regionId);
        const now = this.clock();
        const profile = await tx.pvpProfile.create({
          data: {
            userId,
            regionId,
            alias,
            aliasKey,
            hostname: this.standalone
              ? (hostname ?? aliasKey.replaceAll("_", "-") + "-lab")
              : null,
            config: toJson(
              this.standalone
                ? {
                    ...freshDevice(),
                    tools: Object.keys(PVP_TOOLS) as PvpToolId[],
                  }
                : freshDevice(),
            ),
            energyAt: now,
            lastSeenAt: now,
            createdAt: now,
            events: {
              create: {
                kind: "join",
                regionId,
                createdAt: now,
                data: toJson({
                  message: this.standalone
                    ? "Dispositivo desplegado. Recibiste 20 BTC de Arena."
                    : "Dispositivo desplegado. Recibiste 20 BTC y tus puertos están expuestos.",
                  severity: "notice",
                }),
              },
            },
          },
        });
        await moveBalance(
          tx,
          userId,
          PVP_STARTER_SATS,
          "starter",
          "m64-starter",
          now,
        );
        const wallet = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { balanceSats: true },
        });
        await bumpRegion(tx, regionId);
        return {
          self: privateProfile(profile, now, wallet.balanceSats),
          granted: true,
        };
      }, WRITE_TRANSACTION);
    } catch (error: unknown) {
      // Parallel first joins to different regions compete on the unique userId.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const created = await this.db.pvpProfile.findUnique({
          where: { userId },
          include,
        });
        if (created) return this.rejoin(created, regionId);
        throw new HttpError(409, "Ese alias ya se usa en esta región.");
      }
      throw error;
    }
  }

  async transfer(
    userId: string,
    destination: PvpRegionId,
    arenaVisit: number,
    requestedAlias?: string,
  ): Promise<PvpJoinResult> {
    return economyTransaction(this.db, async (tx) => {
      const before = await tx.pvpProfile.findUnique({
        where: { userId },
        include: { user: { select: { balanceSats: true } } },
      });
      if (!before)
        throw new HttpError(
          409,
          "Despliega tu dispositivo para cambiar de arena.",
        );
      const origin = regionIdOf(before);
      if (origin === destination) return this.rejoin(before, destination);
      if (before.arenaVisit !== arenaVisit)
        throw new HttpError(
          409,
          "La arena cambió. Actualiza tu selección y vuelve a entrar.",
        );

      for (const id of [origin, destination].sort()) await lockRegion(tx, id);
      // Actions in the origin may have updated the device while this transfer waited.
      const current = await tx.pvpProfile.findUniqueOrThrow({
        where: { id: before.id },
      });
      if (current.regionId !== origin || current.arenaVisit !== arenaVisit)
        throw new HttpError(
          409,
          "La arena cambió. Actualiza tu selección y vuelve a entrar.",
        );
      const alias = requestedAlias ?? current.alias;
      const aliasKey = alias.toLowerCase();
      const duplicate = await tx.pvpProfile.findUnique({
        where: { regionId_aliasKey: { regionId: destination, aliasKey } },
        select: { id: true },
      });
      if (duplicate)
        throw new HttpError(
          409,
          "Ese alias ya se usa en el destino. Elige otro para entrar.",
        );
      await requireSlot(tx, destination);

      const now = this.clock();
      const originKey = { profileId: current.id, regionId: origin };
      const destinationKey = { profileId: current.id, regionId: destination };
      const previous = await tx.pvpArenaRecord.findUnique({
        where: { profileId_regionId: destinationKey },
      });
      const record = { score: current.score, compromises: current.compromises };
      await tx.pvpArenaRecord.upsert({
        where: { profileId_regionId: originKey },
        create: { ...originKey, ...record },
        update: record,
      });
      if (previous)
        await tx.pvpArenaRecord.delete({
          where: { profileId_regionId: destinationKey },
        });
      await closeTravelLinks(tx, current, now);
      const moved = await tx.pvpProfile.update({
        where: { id: current.id },
        data: {
          regionId: destination,
          alias,
          aliasKey,
          score: previous?.score ?? 0,
          compromises: previous?.compromises ?? 0,
          arenaVisit: { increment: 1 },
          revision: { increment: 1 },
          lastSeenAt: now,
        },
      });
      const name = pvpRegion(destination).name;
      await tx.pvpEvent.create({
        data: {
          profileId: current.id,
          regionId: destination,
          arenaVisit: moved.arenaVisit,
          kind: "transfer",
          createdAt: now,
          data: toJson({
            message: `Dispositivo trasladado a ${name}.`,
            severity: "notice",
          }),
        },
      });
      await bumpRegion(tx, origin);
      await bumpRegion(tx, destination);
      return {
        self: privateProfile(moved, now, before.user.balanceSats),
        granted: false,
      };
    });
  }

  async state(
    userId: string,
    requestedPage: number,
    query: string,
  ): Promise<PvpState> {
    const now = this.clock();
    // Requests from an active PvP view refresh presence, at most once per 10 seconds.
    await this.db.pvpProfile.updateMany({
      where: { userId, lastSeenAt: { lt: new Date(now.getTime() - 10_000) } },
      data: { lastSeenAt: now },
    });
    return this.db.$transaction(
      async (tx) => {
        const self = await tx.pvpProfile.findUnique({
          where: { userId },
          include: {
            region: { select: { revision: true } },
            user: { select: { balanceSats: true } },
          },
        });
        if (!self)
          return {
            self: null,
            serverTime: now.toISOString(),
            revision: 0,
            worldRevision: 0,
            peers: [],
            leaderboard: [],
            events: [],
            links: [],
            onlineCount: 0,
            peerCount: 0,
            page: 0,
          };
        const number = addressNumber(regionIdOf(self), query);
        const where: Prisma.PvpProfileWhereInput = {
          regionId: self.regionId,
          id: { not: self.id },
          ...(query ? { addressNumber: number ?? 0 } : {}),
        };
        const peerCount = await tx.pvpProfile.count({ where });
        const page = Math.min(
          requestedPage,
          Math.max(0, Math.ceil(peerCount / PVP_PAGE_SIZE) - 1),
        );
        const equipment = this.standalone
          ? []
          : (
              await tx.inventoryItem.findMany({
                where: { userId: self.userId, state: "EQUIPPED" },
                select: { sku: true },
              })
            ).map((item) => item.sku);
        const logWindow =
          this.standalone || equipment.includes("ssd") ? 150 : 60;
        const [peers, leaderboard, events, onlineCount, links] =
          await Promise.all([
            tx.pvpProfile.findMany({
              where,
              select: peerSelect,
              orderBy: [{ aliasKey: "asc" }, { id: "asc" }],
              skip: page * PVP_PAGE_SIZE,
              take: PVP_PAGE_SIZE,
            }),
            tx.pvpProfile.findMany({
              where: { regionId: self.regionId },
              select: peerSelect,
              take: 5,
              orderBy: [{ score: "desc" }, { aliasKey: "asc" }],
            }),
            tx.pvpEvent.findMany({
              where: { profileId: self.id, regionId: self.regionId },
              orderBy: { ordinal: "desc" },
              take: logWindow,
            }),
            tx.pvpProfile.count({
              where: {
                regionId: self.regionId,
                lastSeenAt: { gte: new Date(now.getTime() - PVP_PRESENCE_MS) },
              },
            }),
            readLinks(tx, self),
          ]);
        return {
          self: {
            ...privateProfile(self, now, self.user.balanceSats),
            equipment,
          },
          serverTime: now.toISOString(),
          revision: self.revision,
          worldRevision: self.region.revision,
          peers: peers.map((row) => publicPeer(row, now)),
          leaderboard: leaderboard.map((row) => publicPeer(row, now)),
          events: events.map((event) => ({
            ...privateEvent(event),
            ...(event.arenaVisit !== self.arenaVisit ? { archived: true } : {}),
          })),
          links,
          onlineCount,
          peerCount,
          page,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async act(
    userId: string,
    requestId: string,
    action: PvpAction,
    arenaVisit?: number,
  ): Promise<PvpActionResult> {
    if (
      this.standalone &&
      (action.type === "exploit" || action.type === "counter")
    )
      throw new HttpError(
        404,
        "La acción no está disponible en este laboratorio.",
      );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(action))
      .digest("hex");
    return this.db.$transaction(async (tx) => {
      const member = await tx.pvpProfile.findUnique({
        where: { userId },
        select: { id: true, regionId: true, arenaVisit: true },
      });
      if (!member)
        throw new HttpError(
          409,
          "Despliega tu dispositivo antes de operar en PVP.",
        );
      const regionId = regionIdOf(member);
      await lockRegion(tx, regionId);
      const key = { profileId: member.id, requestId };
      const receipt = await tx.pvpReceipt.findUnique({
        where: { profileId_requestId: key },
      });
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new HttpError(
            409,
            "El identificador ya corresponde a otra acción.",
          );
        return receipt.result as unknown as PvpActionResult;
      }
      const actor = await tx.pvpProfile.findUniqueOrThrow({
        where: { id: member.id },
      });
      if (
        actor.arenaVisit !== member.arenaVisit ||
        (arenaVisit !== undefined && actor.arenaVisit !== arenaVisit)
      )
        throw new HttpError(
          409,
          "La arena cambió. Actualiza el panel antes de operar.",
        );
      const now = this.clock();
      const result = await executeTurn(
        tx,
        actor,
        action,
        now,
        "device",
        !this.standalone,
      );
      await tx.pvpReceipt.create({
        data: { ...key, fingerprint, result: toJson(result), createdAt: now },
      });
      if (result.outcome === "compromised") await bumpRegion(tx, regionId);
      await tx.pvpProfile.updateMany({
        where: { id: actor.id, lastSeenAt: { lt: now } },
        data: { lastSeenAt: now },
      });
      return result;
    }, WRITE_TRANSACTION);
  }
}
