import type { Prisma, PvpLink, PvpProfile } from "@prisma/client";
import {
  isPvpProtocol,
  pvpRegion,
  type PvpActionResult,
  type PvpLinkState,
  type PvpProtocol,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import { inspectPort } from "./network";
import { regionIdOf, toJson, virtualHost } from "./records";

type Tx = Prisma.TransactionClient;
type Device = Pick<PvpProfile, "id" | "regionId">;

function deviceLinks(device: Device): Prisma.PvpLinkWhereInput {
  return {
    regionId: device.regionId,
    OR: [{ sourceId: device.id }, { targetId: device.id }],
  };
}

export async function openLink(
  db: Tx,
  source: PvpProfile,
  target: PvpProfile,
  protocol: PvpProtocol,
  port: number,
  now: Date,
): Promise<PvpActionResult> {
  const observed = inspectPort(
    virtualHost(source),
    virtualHost(target),
    protocol,
    port,
    now,
  );
  const endpoint = protocol.toUpperCase() + "/" + port;
  if (observed.observation.state !== "open") {
    const reason =
      observed.reason ??
      (observed.observation.state === "filtered"
        ? "tráfico filtrado"
        : "puerto cerrado");
    return {
      outcome: "blocked",
      message: `${endpoint} · ${reason}`,
      ports: [observed.observation],
    };
  }

  const key = {
    regionId: source.regionId,
    sourceId: source.id,
    targetId: target.id,
    protocol,
    port,
  };
  const where = { regionId_sourceId_targetId_protocol_port: key };
  const existing = await db.pvpLink.findUnique({ where });
  if (!existing || existing.closedAt) {
    const counts = await Promise.all(
      [source, target].map((device) =>
        db.pvpLink.count({ where: { ...deviceLinks(device), closedAt: null } }),
      ),
    );
    if (
      counts.some((count) => count >= pvpRegion(regionIdOf(source)).linkLimit)
    )
      throw new HttpError(
        409,
        "Uno de los equipos alcanzó el límite de enlaces activos.",
      );
    const connection = { openedAt: now, encryption: observed.encryption };
    await db.pvpLink.upsert({
      where,
      create: { ...key, ...connection },
      update: { ...connection, closedAt: null, reason: null },
    });
    await db.pvpProfile.update({
      where: { id: target.id },
      data: { revision: { increment: 1 } },
    });
    await db.pvpEvent.createMany({
      data: [
        {
          profileId: source.id,
          regionId: source.regionId,
          arenaVisit: source.arenaVisit,
          peerId: target.id,
          kind: "link",
          createdAt: now,
          data: toJson({
            message: `Enlace abierto hacia ${target.alias} · ${endpoint}.`,
            severity: "info",
          }),
        },
        {
          profileId: target.id,
          regionId: target.regionId,
          arenaVisit: target.arenaVisit,
          peerId: source.id,
          kind: "link",
          createdAt: now,
          data: toJson({
            message: `Enlace recibido de ${source.alias} · ${endpoint}.`,
            severity: "info",
          }),
        },
      ],
    });
    await db.worldSignal.create({
      data: {
        regionId: source.regionId,
        actorId: source.id,
        rivalId: target.id,
        actorNode: source.addressNumber,
        rivalNode: target.addressNumber,
        kind: "LINK",
        createdAt: now,
      },
    });
  }
  return {
    outcome: "ok",
    message: `Enlace virtual activo con ${target.alias} · ${endpoint}.`,
    ports: [observed.observation],
  };
}

async function closeLinks(
  db: Tx,
  closures: { link: PvpLink; reason: string }[],
  now: Date,
): Promise<void> {
  if (!closures.length) return;
  const profiles = new Set<string>();
  for (const { link, reason } of closures) {
    await db.pvpLink.update({
      where: { id: link.id },
      data: { closedAt: now, reason },
    });
    profiles.add(link.sourceId);
    profiles.add(link.targetId);
  }
  await db.pvpProfile.updateMany({
    where: { id: { in: [...profiles] } },
    data: { revision: { increment: 1 } },
  });
  const members = await db.pvpProfile.findMany({
    where: { id: { in: [...profiles] } },
    select: { id: true, arenaVisit: true },
  });
  const visits = new Map(
    members.map((member) => [member.id, member.arenaVisit]),
  );
  await db.pvpEvent.createMany({
    data: closures.flatMap(({ link, reason }) =>
      (
        [
          [link.sourceId, link.targetId],
          [link.targetId, link.sourceId],
        ] as const
      ).map(([profileId, peerId]) => ({
        profileId,
        peerId,
        regionId: link.regionId,
        arenaVisit: visits.get(profileId)!,
        kind: "link",
        createdAt: now,
        data: toJson({
          message: `Enlace ${link.protocol.toUpperCase()}/${link.port} cerrado. ${reason}`,
          severity: "notice",
        }),
      })),
    ),
  });
}

export async function closeTravelLinks(
  db: Tx,
  device: Device,
  now: Date,
): Promise<void> {
  const links = await db.pvpLink.findMany({
    where: { ...deviceLinks(device), closedAt: null },
  });
  await closeLinks(
    db,
    links.map((link) => ({ link, reason: "El dispositivo cambió de arena." })),
    now,
  );
}

export async function reconcileLinks(
  db: Tx,
  device: Device,
  now: Date,
): Promise<void> {
  const links = await db.pvpLink.findMany({
    where: { ...deviceLinks(device), closedAt: null },
    include: { source: true, target: true },
  });
  const closures = links.flatMap((link) => {
    if (!isPvpProtocol(link.protocol))
      throw new Error("Invalid virtual link protocol");
    const observed = inspectPort(
      virtualHost(link.source),
      virtualHost(link.target),
      link.protocol,
      link.port,
      now,
    );
    if (
      observed.observation.state === "open" &&
      observed.encryption === link.encryption
    )
      return [];
    const reason =
      observed.reason ??
      {
        closed: "El servicio dejó de escuchar en ese puerto.",
        filtered: "La nueva configuración filtra el enlace.",
        open: "Cambió el cifrado del enlace.",
      }[observed.observation.state];
    return [{ link, reason }];
  });
  await closeLinks(db, closures, now);
}

export async function readLinks(
  db: Tx,
  device: Device,
): Promise<PvpLinkState[]> {
  const rows = await db.pvpLink.findMany({
    where: deviceLinks(device),
    orderBy: [
      { closedAt: { sort: "desc", nulls: "first" } },
      { openedAt: "desc" },
      { id: "asc" },
    ],
    take: 24,
    include: {
      source: { select: { alias: true } },
      target: { select: { alias: true } },
    },
  });
  return rows.map((row) => {
    if (!isPvpProtocol(row.protocol))
      throw new Error("Invalid virtual link protocol");
    const incoming = row.targetId === device.id;
    return {
      id: row.id,
      peerAlias: incoming ? row.source.alias : row.target.alias,
      incoming,
      protocol: row.protocol,
      port: row.port,
      openedAt: row.openedAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      reason: row.reason,
    };
  });
}
