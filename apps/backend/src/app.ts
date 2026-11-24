import { readWorld } from "./game/observatory";
import { ExchangeService } from "./exchange/service";
import { parseExchangeAction } from "./exchange/validation";
import express, {
  type NextFunction,
  type Request,
  type Response,
  type Express,
} from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import {
  ARENA_WORKSPACE_ROOT,
  campaignMission,
  isPvpRegionId,
  isRecord,
} from "@null-protocol/shared";
import { asyncRoute, HttpError } from "./lib/http";
import {
  accountState,
  linkGuest,
  loginOperator,
  parseCredentials,
  restoreMigratedAccount,
} from "./lib/account";
import { sessionCookieName, type RuntimeMode } from "./lib/mode";
import { proxyTrust } from "./lib/client-address";
import { meetsPrerequisites } from "./game/progression";
import { certificateView } from "./game/campaign/progress";
import { PvpService } from "./pvp/service";
import { portalDrill } from "./pvp/drill";
import { workspaceRoutes } from "./workspace/routes";
import { academyRoutes } from "./academy/routes";
import {
  parseAction,
  parseJoin,
  parseRosterQuery,
  parseTransfer,
} from "./pvp/validation";
import {
  authenticate,
  hashToken,
  newSessionToken,
  SESSION_TTL_MS,
  type AuthenticatedSession,
} from "./lib/session";

export interface AppSettings {
  allowedOrigins: string[];
  production: boolean;
  trustedProxyIps?: string[];
  mode?: RuntimeMode;
  arenaWeb?: string;
}
export const publicLevelSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  difficulty: true,
  isActive: true,
  orderIndex: true,
} as const;
export function verifyFlag(candidate: string, expected: string): boolean {
  const digest = (value: string): Buffer =>
    createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
function requireSession(db: PrismaClient, cookieName: string) {
  return asyncRoute(async (req, res, next) => {
    const session = await authenticate(db, req, cookieName);
    if (!session)
      throw new HttpError(401, "Inicia una sesión de invitado para continuar");
    res.locals.session = session;
    next();
  });
}
const getSession = (res: Response): AuthenticatedSession =>
  res.locals.session as AuthenticatedSession;

export function createApp(
  db: PrismaClient,
  settings: AppSettings,
  pvp = new PvpService(db, undefined, settings.mode === "pvp"),
): Express {
  const app = express();
  const mode = settings.mode ?? "legacy";
  const cookieName = sessionCookieName(mode, settings.production);
  const requireAccount = requireSession(db, cookieName);
  app.disable("x-powered-by");
  if (settings.trustedProxyIps?.length)
    app.set("trust proxy", proxyTrust(settings.trustedProxyIps));
  if (mode === "pvp" && settings.arenaWeb) {
    const sockets = settings.allowedOrigins.map((origin) =>
      origin.replace(/^http/, "ws"),
    );
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            connectSrc: ["'self'", ...sockets],
            upgradeInsecureRequests: settings.production ? [] : null,
          },
        },
      }),
    );
  } else {
    app.use(helmet());
  }
  app.use((req, _res, next) => {
    const origin = req.headers.origin;
    if (origin && !settings.allowedOrigins.includes(origin)) {
      next(new HttpError(403, "Origen no permitido"));
      return;
    }
    next();
  });
  app.use(cors({ origin: settings.allowedOrigins, credentials: true }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    }),
  );
  app.use(
    "/api/workspace",
    workspaceRoutes(
      db,
      requireAccount,
      mode === "pvp" ? ARENA_WORKSPACE_ROOT : undefined,
    ),
  );
  app.use(express.json({ limit: "8kb", strict: true }));
  if (mode !== "pvp")
    app.use("/api/academy", academyRoutes(db, requireAccount));

  app.get(
    "/health",
    asyncRoute(async (_req, res) => {
      try {
        await db.$queryRaw`SELECT 1`;
        res.json({
          status: "ok",
          db: "connected",
          uptime: process.uptime(),
          mode,
        });
      } catch {
        res.status(503).json({ status: "degraded", db: "disconnected" });
      }
    }),
  );

  const sessionCookie = {
    httpOnly: true,
    secure: settings.production,
    sameSite: "strict" as const,
    path: "/",
  };
  const writeSession = (res: Response, token: string): void => {
    res.cookie(cookieName, token, {
      ...sessionCookie,
      maxAge: SESSION_TTL_MS,
    });
  };
  const sessionLimit = rateLimit({
    windowMs: 60 * 60_000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.post(
    "/api/session",
    sessionLimit,
    asyncRoute(async (req, res) => {
      const existing = await authenticate(db, req, cookieName);
      if (existing) {
        res.json({ user: existing.user });
        return;
      }
      const id = randomUUID();
      const token = newSessionToken();
      const user = await db.user.create({
        data: {
          username: `guest_${id}`,
          email: `${id}@guest.invalid`,
          password: `!guest:${randomUUID()}`,
          role: "GUEST",
          sessions: {
            create: {
              token: hashToken(token),
              expiresAt: new Date(Date.now() + SESSION_TTL_MS),
            },
          },
        },
        select: { id: true, username: true },
      });
      writeSession(res, token);
      res.status(201).json({ user });
    }),
  );
  app.get("/api/session", requireAccount, (_req, res) => {
    res.json({ user: getSession(res).user });
  });
  app.delete(
    "/api/session",
    requireAccount,
    asyncRoute(async (_req, res) => {
      await db.session.deleteMany({ where: { id: getSession(res).id } });
      res.clearCookie(cookieName, sessionCookie);
      res.status(204).end();
    }),
  );

  app.get(
    "/api/account",
    requireAccount,
    asyncRoute(async (_req, res) => {
      res.json(await accountState(db, getSession(res).user.id));
    }),
  );
  const accountLimit = rateLimit({
    windowMs: 10 * 60_000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  });
  app.post(
    "/api/account/link",
    accountLimit,
    requireAccount,
    asyncRoute(async (req, res) => {
      const userId = getSession(res).user.id;
      await linkGuest(db, userId, parseCredentials(req.body));
      res.json(await accountState(db, userId));
    }),
  );
  app.post(
    "/api/account/login",
    accountLimit,
    asyncRoute(async (req, res) => {
      const credentials = parseCredentials(req.body);
      const previous = await authenticate(db, req, cookieName);
      const session = await loginOperator(db, credentials, previous?.id);
      writeSession(res, session.token);
      res.json({ user: session.user });
    }),
  );

  if (mode !== "legacy")
    app.post(
      "/api/account/migration",
      accountLimit,
      asyncRoute(async (req, res) => {
        const previous = await authenticate(db, req, cookieName);
        const session = await restoreMigratedAccount(
          db,
          req.body,
          previous?.id,
        );
        writeSession(res, session.token);
        res.json({ user: session.user });
      }),
    );

  if (mode !== "pvp") {
    app.get(
      "/api/levels",
      asyncRoute(async (_req, res) => {
        const levels = await db.level.findMany({
          where: { isActive: true },
          orderBy: { orderIndex: "asc" },
          select: publicLevelSelect,
        });
        res.json(levels);
      }),
    );
    app.get(
      "/api/levels/:slug",
      asyncRoute(async (req, res) => {
        const slug = req.params.slug;
        if (!slug || slug.length > 120)
          throw new HttpError(400, "Identificador de nivel inválido");
        const level = await db.level.findFirst({
          where: { slug, isActive: true },
          select: publicLevelSelect,
        });
        if (!level) throw new HttpError(404, "Nivel no encontrado");
        res.json(level);
      }),
    );

    app.get(
      "/api/progress",
      requireAccount,
      asyncRoute(async (_req, res) => {
        const progress = await db.userProgress.findMany({
          where: { userId: getSession(res).user.id, level: { isActive: true } },
          orderBy: { level: { orderIndex: "asc" } },
          include: { level: { select: publicLevelSelect } },
        });
        res.json(progress);
      }),
    );
    app.get(
      "/api/campaign/certificates/:code",
      asyncRoute(async (req, res) => {
        const code = req.params.code;
        if (!code || !/^XWD-[A-F0-9]{24}$/.test(code))
          throw new HttpError(404, "Certificación no encontrada.");
        const run = await db.campaignRun.findUnique({
          where: { certificateCode: code },
        });
        const certificate = certificateView(run);
        if (!certificate)
          throw new HttpError(404, "Certificación no encontrada.");
        res.json(certificate);
      }),
    );
    const submissionLimit = rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-7",
      legacyHeaders: false,
    });
    app.post(
      "/api/progress",
      requireAccount,
      submissionLimit,
      asyncRoute(async (req, res) => {
        const body: unknown = req.body;
        if (
          !isRecord(body) ||
          Object.keys(body).some((key) => !["levelId", "flag"].includes(key)) ||
          typeof body.levelId !== "string" ||
          body.levelId.length === 0 ||
          body.levelId.length > 100 ||
          typeof body.flag !== "string" ||
          body.flag.length === 0 ||
          body.flag.length > 256
        ) {
          throw new HttpError(
            400,
            "Envía solamente levelId y flag (textos válidos)",
          );
        }
        const level = await db.level.findFirst({
          where: { id: body.levelId, isActive: true },
          select: { id: true, flag: true, slug: true },
        });
        if (!level) throw new HttpError(404, "Nivel no encontrado");
        if (campaignMission(level.slug))
          throw new HttpError(
            409,
            "Abre este caso en la consola y usa check para entregar evidencias.",
          );
        const userId = getSession(res).user.id;
        if (!(await meetsPrerequisites(db, userId, level.slug)))
          throw new HttpError(
            409,
            "Completa las misiones anteriores antes de entregar esta flag.",
          );
        const accepted = verifyFlag(body.flag, level.flag);
        const levelId = level.id;
        const now = new Date();
        const progress = await db.$transaction(async (tx) => {
          const row = await tx.userProgress.upsert({
            where: { userId_levelId: { userId, levelId } },
            create: {
              userId,
              levelId,
              completed: accepted,
              completedAt: accepted ? now : null,
              attempts: 1,
            },
            update: {
              attempts: { increment: 1 },
              ...(accepted ? { completed: true } : {}),
            },
          });
          // Only fill the first successful timestamp; wrong or repeated flags never undo success.
          if (accepted && row.completedAt === null) {
            await tx.userProgress.updateMany({
              where: { id: row.id, completedAt: null },
              data: { completedAt: now },
            });
          }
          return tx.userProgress.findUniqueOrThrow({
            where: { id: row.id },
            include: { level: { select: publicLevelSelect } },
          });
        });
        res.json({ accepted, progress });
      }),
    );
  }

  const pvpAuth = requireAccount;
  const actionLimit = rateLimit({
    windowMs: 60_000,
    limit: 45,
    keyGenerator: (_req, res) => getSession(res).user.id,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Demasiadas acciones PVP. Espera un momento." },
  });
  if (mode !== "story") {
    const drillPath = "/api/pvp/drills/portal";
    app.get(
      drillPath,
      pvpAuth,
      asyncRoute(async (_req, res) => {
        res
          .set("Cache-Control", "no-store")
          .json(await portalDrill(db, getSession(res).user.id, false));
      }),
    );
    app.post(
      drillPath,
      pvpAuth,
      actionLimit,
      asyncRoute(async (req, res) => {
        if (
          req.body !== undefined &&
          (!isRecord(req.body) || Object.keys(req.body).length)
        )
          throw new HttpError(
            400,
            "La evaluación usa la configuración de tu dispositivo.",
          );
        res
          .set("Cache-Control", "no-store")
          .json(await portalDrill(db, getSession(res).user.id, true));
      }),
    );
    app.get(
      "/api/pvp/state",
      pvpAuth,
      asyncRoute(async (req, res) => {
        const { page, query } = parseRosterQuery(req.query.page, req.query.q);
        res.json(await pvp.state(getSession(res).user.id, page, query));
      }),
    );
    app.post(
      "/api/pvp/join",
      pvpAuth,
      actionLimit,
      asyncRoute(async (req, res) => {
        const { regionId, alias, hostname } = parseJoin(req.body);
        const result = await pvp.join(
          getSession(res).user.id,
          regionId,
          alias,
          hostname,
        );
        res.status(result.granted ? 201 : 200).json(result);
      }),
    );
    app.post(
      "/api/pvp/transfer",
      pvpAuth,
      actionLimit,
      asyncRoute(async (req, res) => {
        const { regionId, arenaVisit, alias } = parseTransfer(req.body);
        res.json(
          await pvp.transfer(
            getSession(res).user.id,
            regionId,
            arenaVisit,
            alias,
          ),
        );
      }),
    );
    app.post(
      "/api/pvp/action",
      pvpAuth,
      actionLimit,
      asyncRoute(async (req, res) => {
        const { requestId, command, arenaVisit } = parseAction(req.body);
        res.json(
          await pvp.act(
            getSession(res).user.id,
            requestId,
            command,
            arenaVisit,
          ),
        );
      }),
    );

    app.get(
      "/api/world",
      asyncRoute(async (req, res) => {
        const arena = req.query.arena;
        if (arena !== undefined && !isPvpRegionId(arena))
          throw new HttpError(400, "La arena solicitada no existe.");
        res.json(await readWorld(db, new Date(), arena));
      }),
    );
  }
  const exchange = new ExchangeService(db, undefined, mode);
  const deskPath = mode === "pvp" ? "/api/contracts" : "/api/exchange";
  app.get(
    deskPath,
    pvpAuth,
    asyncRoute(async (_req, res) => {
      res.json(await exchange.state(getSession(res).user.id));
    }),
  );
  app.post(
    deskPath + "/actions",
    pvpAuth,
    actionLimit,
    asyncRoute(async (req, res) => {
      const { requestId, action } = parseExchangeAction(req.body);
      res.json(
        await exchange.execute(getSession(res).user.id, requestId, action),
      );
    }),
  );

  if (mode === "pvp" && settings.arenaWeb) {
    const web = settings.arenaWeb;
    app.get("/", (_req, res) => res.redirect(302, "/pvp"));
    app.use(
      "/assets",
      express.static(resolve(web, "assets"), {
        immutable: true,
        maxAge: "1y",
        index: false,
      }),
    );
    app.get(
      [
        "/pvp",
        "/terminal",
        "/arena",
        "/dispositivo",
        "/servidores",
        "/entrenamiento",
        "/contratos",
      ],
      (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(resolve(web, "index.html"));
      },
    );
  }

  app.use((_req, res) => {
    res.status(404).json({ error: "Ruta no encontrada" });
  });
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      _next(err);
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const type = isRecord(err) ? err.type : undefined;
    if (type === "entity.parse.failed") {
      res.status(400).json({ error: "JSON inválido" });
      return;
    }
    if (type === "entity.too.large") {
      res.status(413).json({ error: "Petición demasiado grande" });
      return;
    }
    console.error(
      "Request failed:",
      err instanceof Error ? err.message : "Unknown error",
    );
    res.status(500).json({ error: "Error interno del servidor" });
  });
  return app;
}
