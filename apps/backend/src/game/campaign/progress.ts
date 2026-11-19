import { createHash, randomBytes } from "node:crypto";
import type { CampaignRun, Prisma, PrismaClient } from "@prisma/client";
import {
  isRecord,
  translator,
  type CampaignBranchId,
  type Translator,
} from "@null-protocol/shared";
import { HttpError } from "../../lib/http";
import { CERTIFICATE_NAME, PASS_SCORE, VARIANTS, finalScenes } from "./final";

export type SceneTarget =
  | { kind: "mission"; code: string; slug: string; levelId: string }
  | { kind: "branch"; code: CampaignBranchId };

const gradeLimits = Object.entries(finalScenes(VARIANTS[0])).flatMap(
  ([code, scene]) =>
    scene.grade
      ? [
          [
            code,
            scene.grade.base +
              (scene.grade.bonus ?? []).reduce(
                (sum, bonus) => sum + bonus.points,
                0,
              ),
          ] as const,
        ]
      : [],
);
type RunChanges = Pick<
  Prisma.CampaignRunUncheckedCreateInput,
  | "grades"
  | "reviewed"
  | "certificateCode"
  | "certificateScore"
  | "certificateVariant"
  | "certificateIssuedAt"
>;

export function variantFor(userId: string, attempt: number) {
  const offset = createHash("sha256").update(userId).digest().readUInt16BE();
  return VARIANTS[(offset + attempt) % VARIANTS.length]!;
}

export function campaignReport(run: CampaignRun | null) {
  const stored = isRecord(run?.grades) ? run.grades : {};
  const grades: Record<string, number> = {};
  for (const [code, max] of gradeLimits) {
    const value = stored[code];
    if (
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= max
    )
      grades[code] = value;
  }
  const score = Object.values(grades).reduce(
    (total, value) => total + value,
    0,
  );
  const pending = gradeLimits
    .filter(([code]) => grades[code] === undefined)
    .map(([code]) => code);
  return {
    grades,
    score,
    pending,
    eligible: pending.length === 0 && score >= PASS_SCORE,
  };
}

export function certificateView(run: CampaignRun | null) {
  if (
    !run?.certificateCode ||
    !run.certificateIssuedAt ||
    !run.certificateVariant ||
    run.certificateScore === null
  )
    return null;
  return {
    code: run.certificateCode,
    title: CERTIFICATE_NAME,
    score: run.certificateScore,
    variant: run.certificateVariant,
    issuedAt: run.certificateIssuedAt.toISOString(),
  };
}

async function lockPlayer(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  if (!rows.length)
    throw new HttpError(401, "La sesión ya no está disponible.");
}

export async function completeScene(
  db: PrismaClient,
  userId: string,
  target: SceneTarget,
  attempt: number,
  points?: number,
) {
  return db.$transaction(async (tx) => {
    await lockPlayer(tx, userId);
    const run = await tx.campaignRun.findUnique({ where: { userId } });
    if (target.kind === "branch") {
      if (!run?.branches.includes(target.code)) {
        await tx.campaignRun.upsert({
          where: { userId },
          create: { userId, branches: [target.code] },
          update: { branches: { push: target.code } },
        });
      }
      return null;
    }
    const capstone = target.code.startsWith("6.");
    if (capstone && (run?.attempt ?? 0) !== attempt)
      throw new HttpError(
        409,
        "Hay otra variante activa. Usa mission continuar para abrirla.",
      );
    const now = new Date();
    const progress = await tx.userProgress.upsert({
      where: { userId_levelId: { userId, levelId: target.levelId } },
      create: {
        userId,
        levelId: target.levelId,
        completed: true,
        completedAt: now,
        attempts: 1,
      },
      update: { completed: true, attempts: { increment: 1 } },
      select: { id: true, completedAt: true },
    });
    if (progress.completedAt === null) {
      await tx.userProgress.update({
        where: { id: progress.id },
        data: { completedAt: now },
      });
    }
    if (!capstone) return null;
    const { grades, eligible, score } = campaignReport(run);
    const data: RunChanges = {};
    if (points !== undefined && (grades[target.code] ?? -1) < points) {
      data.grades = { ...grades, [target.code]: points };
      data.reviewed = false;
    }
    if (target.code === "6.10") {
      data.reviewed = true;
      if (eligible && !run?.certificateCode) {
        data.certificateCode =
          "XWD-" + randomBytes(12).toString("hex").toUpperCase();
        data.certificateScore = score;
        data.certificateVariant = variantFor(userId, attempt).id;
        data.certificateIssuedAt = now;
      }
    }
    if (!Object.keys(data).length) return run;
    return tx.campaignRun.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  });
}

export function gradeSummary(
  run: CampaignRun | null,
  userId: string,
  t: Translator = translator("es"),
): string {
  const report = campaignReport(run);
  const variant = variantFor(userId, run?.attempt ?? 0);
  const lines = gradeLimits.map(
    ([code, max]) =>
      code + " · " + (report.grades[code] ?? t("pendiente")) + "/" + max,
  );
  const certificate = certificateView(run);
  return [
    t(CERTIFICATE_NAME),
    t("Variante {v1} · {v2}/100 · mínimo {PASS_SCORE}", {
      v1: variant.id,
      v2: report.score,
      PASS_SCORE,
    }),
    ...lines,
    ...(certificate
      ? [
          t("Certificación interna emitida · {v1} · {v2}/100", {
            v1: certificate.variant,
            v2: certificate.score,
          }),
          t("Código: {v1}", { v1: certificate.code }),
          t("Verificación: /api/campaign/certificates/{v1}", {
            v1: certificate.code,
          }),
        ]
      : [
          report.eligible
            ? t(
                "Evaluación aprobada. Cierra 6.10 para emitir la certificación.",
              )
            : t(
                "Completa las pruebas pendientes o mejora las evidencias de los niveles puntuados.",
              ),
        ]),
  ].join("\n");
}

export async function beginRetake(db: PrismaClient, userId: string) {
  return db.$transaction(async (tx) => {
    await lockPlayer(tx, userId);
    return tx.campaignRun.upsert({
      where: { userId },
      create: { userId, attempt: 1 },
      update: { attempt: { increment: 1 }, grades: {}, reviewed: false },
    });
  });
}
