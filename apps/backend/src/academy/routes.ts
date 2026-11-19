import express, {
  type Request,
  type RequestHandler,
  type Response,
  type Router,
} from "express";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ACADEMY_LESSONS,
  ACADEMY_TOOLS,
  isAcademyLessonId,
  isAcademyToolId,
  isRecord,
  type AcademyCase,
  type AcademyLessonId,
  type AcademyResult,
  type AcademyState,
} from "@null-protocol/shared";
import { asyncRoute, HttpError } from "../lib/http";
import type { AuthenticatedSession } from "../lib/session";
import { CASES } from "./cases";
import { backendTranslator } from "../locales";

const language = (req: Request) =>
  backendTranslator(req.get("Accept-Language") === "en" ? "en" : "es");

const lessonId = (value: unknown): AcademyLessonId => {
  if (!isAcademyLessonId(value))
    throw new HttpError(404, "Práctica no encontrada.");
  return value;
};
const requiredTools = (id: AcademyLessonId) =>
  ACADEMY_TOOLS.filter((item) => item.lessonId === id).map((item) => item.id);

async function readState(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<AcademyState> {
  const [licenses, progress] = await Promise.all([
    db.academyLicense.findMany({ where: { userId }, select: { toolId: true } }),
    db.academyProgress.findMany({
      where: { userId },
      select: { lessonId: true, attempts: true, completedAt: true },
    }),
  ]);
  const records = new Map(progress.map((row) => [row.lessonId, row]));
  return {
    installed: licenses.map((row) => row.toolId).filter(isAcademyToolId),
    progress: ACADEMY_LESSONS.map(({ id }, index) => {
      const current = records.get(id);
      const previous = ACADEMY_LESSONS[index - 1];
      return {
        id,
        unlocked: !previous || Boolean(records.get(previous.id)?.completedAt),
        attempts: current?.attempts ?? 0,
        completedAt: current?.completedAt?.toISOString() ?? null,
      };
    }),
  };
}

async function checkAccess(
  db: Prisma.TransactionClient,
  userId: string,
  id: AcademyLessonId,
  prepared: boolean,
) {
  const index = ACADEMY_LESSONS.findIndex((lesson) => lesson.id === id);
  const previous = ACADEMY_LESSONS[index - 1];
  if (previous) {
    const record = await db.academyProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId: previous.id } },
      select: { completedAt: true },
    });
    if (!record?.completedAt)
      throw new HttpError(
        409,
        `Completa «${previous.title}» para desbloquear esta práctica.`,
      );
  }
  if (prepared) {
    const tools = requiredTools(id);
    if (
      (await db.academyLicense.count({
        where: { userId, toolId: { in: tools } },
      })) !== tools.length
    )
      throw new HttpError(
        409,
        "Prepara la práctica para cargar sus herramientas.",
      );
  }
}

function readAnswers(id: AcademyLessonId, input: unknown) {
  const checks = CASES[id].checks;
  if (
    !isRecord(input) ||
    !isRecord(input.answers) ||
    Object.keys(input).length !== 1 ||
    Object.keys(input.answers).length !== checks.length
  )
    throw new HttpError(400, "Responde cada pregunta de la práctica.");
  const answers = input.answers;
  return checks.map((check) => {
    const value = answers[check.id];
    if (
      typeof value !== "number" ||
      !Number.isInteger(value) ||
      value < 0 ||
      value >= check.options.length
    )
      throw new HttpError(
        400,
        "Selecciona una respuesta válida para cada pregunta.",
      );
    const correct = value === check.answer;
    return { id: check.id, correct, text: correct ? "Correcto." : check.hint };
  });
}

export function academyRoutes(db: PrismaClient, auth: RequestHandler): Router {
  const router = express.Router();
  const user = (res: Response) =>
    (res.locals.session as AuthenticatedSession).user.id;
  router.use(auth);
  router.get(
    "/",
    asyncRoute(async (_req, res) => {
      res.json(await readState(db, user(res)));
    }),
  );
  router.post(
    "/licenses/:toolId",
    asyncRoute(async (req, res) => {
      const toolId = req.params.toolId;
      if (!isAcademyToolId(toolId))
        throw new HttpError(404, "Herramienta no encontrada.");
      const userId = user(res);
      await db.academyLicense.createMany({
        data: [{ userId, toolId }],
        skipDuplicates: true,
      });
      res.json(await readState(db, userId));
    }),
  );
  router.post(
    "/lessons/:id/prepare",
    asyncRoute(async (req, res) => {
      const id = lessonId(req.params.id);
      const userId = user(res);
      await checkAccess(db, userId, id, false);
      await db.academyLicense.createMany({
        data: requiredTools(id).map((toolId) => ({ userId, toolId })),
        skipDuplicates: true,
      });
      res.json(await readState(db, userId));
    }),
  );
  router.get(
    "/lessons/:id",
    asyncRoute(async (req, res) => {
      const id = lessonId(req.params.id);
      const userId = user(res);
      await checkAccess(db, userId, id, true);
      const { briefing, evidence, checks, review } = CASES[id];
      const progress = await db.academyProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId: id } },
        select: { completedAt: true },
      });
      const t = language(req);
      const details: AcademyCase = {
        briefing: t(briefing),
        evidence: evidence.map((item) => ({
          ...item,
          title: t(item.title),
          columns: item.columns.map((column) => t(column)),
          rows: item.rows.map((row) => row.map((cell) => t(cell))),
        })),
        questions: checks.map(({ id: questionId, prompt, options }) => ({
          id: questionId,
          prompt: t(prompt),
          options: options.map((option) => t(option)),
        })),
        review: progress?.completedAt ? t(review) : null,
      };
      res.json(details);
    }),
  );
  router.post(
    "/lessons/:id/submit",
    asyncRoute(async (req, res) => {
      const id = lessonId(req.params.id);
      const t = language(req);
      const feedback = readAnswers(id, req.body).map((item) => ({
        ...item,
        text: t(item.text),
      }));
      const userId = user(res);
      await checkAccess(db, userId, id, true);
      const result = await db.$transaction(
        async (tx): Promise<AcademyResult> => {
          const key = { userId, lessonId: id };
          await tx.academyProgress.createMany({
            data: [key],
            skipDuplicates: true,
          });
          const accepted = feedback.every((item) => item.correct);
          const attempt = await tx.academyProgress.updateMany({
            where: { ...key, completedAt: null },
            data: {
              attempts: { increment: 1 },
              ...(accepted ? { completedAt: new Date() } : {}),
            },
          });
          const progress = await tx.academyProgress.findUniqueOrThrow({
            where: { userId_lessonId: key },
            select: { completedAt: true },
          });
          return {
            accepted: progress.completedAt !== null,
            feedback: attempt.count ? feedback : [],
            review: progress.completedAt ? t(CASES[id].review) : null,
            state: await readState(tx, userId),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
      res.json(result);
    }),
  );
  return router;
}
