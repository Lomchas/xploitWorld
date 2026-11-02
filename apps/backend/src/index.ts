import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer } from "http";
import { config } from "./config";
import { initWsServer } from "./ws";
import { prisma } from "./lib/prisma";

const app = express();
const PORT = config.PORT;
const httpServer = createServer(app);

app.get("/health", async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      uptime: process.uptime(),
      ts: new Date().toISOString(),
      db: "connected",
    });
  } catch {
    res.status(503).json({
      status: "degraded",
      uptime: process.uptime(),
      ts: new Date().toISOString(),
      db: "disconnected",
    });
  }
});

// API Routes

app.get("/api/levels", async (_req: Request, res: Response) => {
  const levels = await prisma.level.findMany({
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      difficulty: true,
      flag: true,
      isActive: true,
    },
  });
  res.json(levels);
});

app.get("/api/levels/:slug", async (req: Request, res: Response) => {
  const { slug } = req.params;
  const level = await prisma.level.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      difficulty: true,
      flag: true,
      isActive: true,
    },
  });

  if (!level) {
    return res.status(404).json({ error: "Level not found" });
  }

  return res.json(level);
});

app.post("/api/progress", async (req: Request, res: Response) => {
  const { userId, levelId, completed } = req.body;

  if (!userId || !levelId) {
    return res.status(400).json({ error: "userId and levelId are required" });
  }

  const progress = await prisma.userProgress.upsert({
    create: {
      userId,
      levelId,
      completed,
      attempts: 1,
    },
    update: {
      completed,
      attempts: { increment: 1 },
      completedAt: completed ? new Date() : null,
    },
    where: { userId_levelId: { userId, levelId } },
  });

  return res.json(progress);
});

app.get("/api/progress/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;

  const progress = await prisma.userProgress.findMany({
    where: { userId },
    orderBy: { levelId: "asc" },
    include: {
      level: {
        select: {
          id: true,
          name: true,
          slug: true,
          difficulty: true,
        },
      },
    },
  });

  res.json(progress);
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

async function main() {
  await prisma.$connect();
  console.log(`[${new Date().toISOString()}] Database connected`);

  initWsServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT} (env: ${config.NODE_ENV})`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  await prisma.$disconnect();
  process.exit(0);
});
