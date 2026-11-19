import {
  ACADEMY_LESSONS,
  ACADEMY_PAYOUTS,
  CAMPAIGN_MISSIONS,
  PVP_REWARD_PAYOUTS,
  TUTORIAL_MISSIONS,
  REWARDS,
  SATS_PER_BTC,
  type ExchangeState,
  type RewardId,
} from "@null-protocol/shared";
import { HttpError } from "../lib/http";
import { isLinkedOperator } from "../lib/account";
import { moveBalance, type Tx } from "./ledger";

export async function completedMissions(
  tx: Tx,
  userId: string,
): Promise<Set<string>> {
  const progress = await tx.userProgress.findMany({
    where: { userId, completed: true },
    select: { level: { select: { slug: true } } },
  });
  return new Set(progress.map((row) => row.level.slug));
}
export const graduated = (slugs: Set<string>): boolean =>
  TUTORIAL_MISSIONS.every((mission) => slugs.has(mission.slug));

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);
export const utcStart = (key: string) => new Date(key + "T00:00:00.000Z");

const chapters = {
  vanta: 1,
  market: 2,
  olvido: 3,
  archivo: 4,
  hielo: 5,
  final: 6,
} as const;
const chapterComplete = (slugs: Set<string>, chapter: number) =>
  CAMPAIGN_MISSIONS.filter((mission) => mission.chapter === chapter).every(
    ({ slug }) => slugs.has(slug),
  );

type RewardCredit = { reference: string; btc: number };

async function credits(
  tx: Tx,
  userId: string,
  profileId: string | undefined,
  slugs: Set<string>,
  now: Date,
  linked: boolean,
  mode: "story" | "pvp" | "legacy",
) {
  const weekStart = utcStart(utcDay(now));
  weekStart.setUTCDate(
    weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7),
  );
  const paid = await tx.walletEntry.findMany({
    where: {
      userId,
      OR: [
        ...(mode === "pvp"
          ? []
          : [{ kind: { in: ["reward-practice", "reward-academy"] } }]),
        ...(mode === "story"
          ? []
          : [{ kind: "reward-pvp", createdAt: { gte: weekStart, lte: now } }]),
      ],
    },
    select: { reference: true },
  });
  const references = new Set(paid.map((row) => row.reference));
  const result = new Map<
    RewardId,
    { credits: RewardCredit[]; claimed: number }
  >();
  const addMilestone = (id: RewardId, unlocked: boolean): void => {
    const reference = "reward:" + id;
    const claimed = references.has(reference) ? 1 : 0;
    result.set(id, {
      credits:
        !claimed && unlocked ? [{ reference, btc: REWARDS[id].btc }] : [],
      claimed,
    });
  };
  if (mode !== "pvp") {
    addMilestone("training", graduated(slugs));
    for (const [id, chapter] of Object.entries(chapters))
      addMilestone(
        id as keyof typeof chapters,
        chapterComplete(slugs, chapter),
      );

    const lessons = new Set(
      (
        await tx.academyProgress.findMany({
          where: { userId, completedAt: { not: null } },
          select: { lessonId: true },
        })
      ).map((row) => row.lessonId),
    );
    result.set("academy", {
      credits: ACADEMY_LESSONS.filter(
        ({ id }) => lessons.has(id) && !references.has("academy:" + id),
      ).map(({ id, tier }) => ({
        reference: "academy:" + id,
        btc: ACADEMY_PAYOUTS[tier],
      })),
      claimed: ACADEMY_LESSONS.filter(({ id }) =>
        references.has("academy:" + id),
      ).length,
    });
  }
  if (mode === "story") return result;

  const day = utcDay(now);
  const prefix = "reward:pvp:" + day + ":";
  const paidRivals = paid.filter((row) => row.reference.startsWith(prefix));
  const creditedRivals = paid
    .filter((row) => row.reference.startsWith("reward:pvp:"))
    .map((row) => row.reference.slice(row.reference.lastIndexOf(":") + 1));
  const slots = PVP_REWARD_PAYOUTS.slice(paidRivals.length);
  const arenaCredits: RewardCredit[] = [];
  if (
    profileId &&
    linked &&
    (mode === "pvp" || graduated(slugs)) &&
    slots.length
  ) {
    const results = await tx.worldSignal.groupBy({
      by: ["rivalId"],
      where: {
        actorId: profileId,
        kind: mode === "pvp" ? "LINK" : "COMPROMISE",
        createdAt: { gte: utcStart(day), lte: now },
        rivalId: { notIn: [profileId, ...creditedRivals] },
      },
      orderBy: { rivalId: "asc" },
    });
    const rivals = await tx.pvpProfile.findMany({
      where: {
        id: { in: results.map((row) => row.rivalId) },
        user: { role: "PLAYER" },
      },
      select: { id: true, user: { select: { role: true, password: true } } },
      orderBy: { id: "asc" },
    });
    for (const [index, rival] of rivals
      .filter((row) => isLinkedOperator(row.user))
      .slice(0, slots.length)
      .entries())
      arenaCredits.push({ reference: prefix + rival.id, btc: slots[index]! });
  }
  result.set("rival", { credits: arenaCredits, claimed: paidRivals.length });
  return result;
}

export async function readRewards(
  tx: Tx,
  userId: string,
  profileId: string | undefined,
  linked: boolean,
  slugs: Set<string>,
  now: Date,
  mode: "story" | "pvp" | "legacy" = "legacy",
): Promise<ExchangeState["rewards"]> {
  const rows = await credits(tx, userId, profileId, slugs, now, linked, mode);
  return [...rows].map(([id, row]) => {
    const available = row.credits.reduce((sum, entry) => sum + entry.btc, 0);
    return {
      id,
      state: available ? "ready" : row.claimed ? "claimed" : "locked",
      available,
    };
  });
}

export async function claimReward(
  tx: Tx,
  userId: string,
  profileId: string | undefined,
  linked: boolean,
  reward: RewardId,
  now: Date,
  mode: "story" | "pvp" | "legacy" = "legacy",
) {
  const rows = await credits(
    tx,
    userId,
    profileId,
    mode === "pvp" ? new Set<string>() : await completedMissions(tx, userId),
    now,
    linked,
    mode,
  );
  const row = rows.get(reward);
  if (!row) throw new HttpError(404, "Esta recompensa pertenece a otro modo.");
  const { credits: pending, claimed } = row;
  if (!pending.length) {
    if (reward === "rival")
      throw new HttpError(
        409,
        "Por ahora no tienes recompensas de arena disponibles.",
      );
    throw new HttpError(
      409,
      claimed
        ? "Esta recompensa ya fue acreditada."
        : "El objetivo todavía está pendiente.",
    );
  }
  const kind =
    reward === "rival"
      ? "reward-pvp"
      : reward === "academy"
        ? "reward-academy"
        : "reward-practice";
  for (const row of pending)
    await moveBalance(
      tx,
      userId,
      BigInt(row.btc) * SATS_PER_BTC,
      kind,
      row.reference,
      now,
    );
  const total = pending.reduce((sum, row) => sum + row.btc, 0);
  return { message: "Objetivo verificado · " + total + " BTC." };
}
