import "dotenv/config";
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer } from "http";
import { config } from "./config";
import { initWsServer } from "./ws";

const app = express();
const PORT = config.PORT;
const httpServer = createServer(app);

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    ts: new Date().toISOString(),
  });
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

initWsServer(httpServer);

httpServer.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT} (env: ${config.NODE_ENV})`);
});
