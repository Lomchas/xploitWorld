import type { Prisma, PvpEvent as EventRow, PvpProfile } from "@prisma/client";
import {
  isPvpRegionId,
  isRecord,
  PVP_PRESENCE_MS,
  type PvpActionResult,
  type PvpDeviceConfig,
  type PvpEvent,
  type PvpEventData,
  type PvpEventKind,
  type PvpPeer,
  type PvpRegionId,
  type PvpSelf,
} from "@null-protocol/shared";
import {
  energyNow,
  virtualAddress,
  virtualIpv4,
  type VirtualHost,
} from "./network";
import { readConfig } from "./validation";

export function toJson(
  value: PvpDeviceConfig | PvpEventData | PvpActionResult,
): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export function regionIdOf(profile: { regionId: string }): PvpRegionId {
  if (!isPvpRegionId(profile.regionId))
    throw new Error("Unknown persisted PVP region");
  return profile.regionId;
}

export const peerSelect = {
  id: true,
  regionId: true,
  addressNumber: true,
  alias: true,
  lastSeenAt: true,
  score: true,
  compromises: true,
} as const;

export function publicPeer(
  profile: Pick<PvpProfile, keyof typeof peerSelect>,
  now: Date,
): PvpPeer {
  return {
    id: profile.id,
    alias: profile.alias,
    address: virtualAddress(regionIdOf(profile), profile.addressNumber),
    ipv4: virtualIpv4(profile.addressNumber),
    online: now.getTime() - profile.lastSeenAt.getTime() <= PVP_PRESENCE_MS,
    score: profile.score,
    compromises: profile.compromises,
  };
}
export function privateProfile(
  profile: PvpProfile,
  now: Date,
  balanceSats: bigint,
): PvpSelf {
  return {
    ...publicPeer(profile, now),
    regionId: regionIdOf(profile),
    hostname:
      profile.hostname ??
      profile.alias.toLowerCase().replaceAll("_", "-") + "-lab",
    arenaVisit: profile.arenaVisit,
    balanceSats: balanceSats.toString(),
    integrity: profile.integrity,
    energy: energyNow(profile.energy, profile.energyAt, now),
    attackReadyAt: profile.attackReadyAt?.toISOString() ?? null,
    repairReadyAt: profile.repairReadyAt?.toISOString() ?? null,
    config: readConfig(profile.config),
  };
}
export function virtualHost(
  profile: PvpProfile,
  config = readConfig(profile.config),
): VirtualHost {
  return {
    id: profile.id,
    address: virtualAddress(regionIdOf(profile), profile.addressNumber),
    integrity: profile.integrity,
    config,
  };
}
export function eventData(row: EventRow): PvpEventData {
  const value: unknown = row.data;
  if (
    !isRecord(value) ||
    typeof value.message !== "string" ||
    !["info", "notice", "warning", "critical"].includes(String(value.severity))
  ) {
    throw new Error("Invalid persisted PVP event");
  }
  return value as unknown as PvpEventData;
}
export function privateEvent(row: EventRow): PvpEvent {
  const data = eventData(row);
  const message =
    row.kind === "join"
      ? data.message.replace("BTC simulados", "BTC")
      : data.message;
  return {
    ...data,
    message,
    id: row.id,
    kind: row.kind as PvpEventKind,
    peerId: row.peerId,
    createdAt: row.createdAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}
