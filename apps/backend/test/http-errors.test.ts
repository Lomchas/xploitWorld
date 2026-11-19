import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app";
let server: Server;
let base: string;
const db = {
  level: {
    findMany: vi
      .fn()
      .mockRejectedValue(new Error("private connection details")),
  },
} as unknown as PrismaClient;
beforeAll(async () => {
  server = createServer(
    createApp(db, {
      production: false,
      allowedOrigins: ["http://localhost:5173"],
    }),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address !== "object")
    throw new Error("No listening address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeIdleConnections();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
it("catches rejected async route promises and never returns connection details", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  try {
    const response = await fetch(`${base}/api/levels`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Error interno del servidor",
    });
  } finally {
    log.mockRestore();
  }
});
it("returns a controlled error for invalid JSON before touching the database", async () => {
  const response = await fetch(`${base}/api/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "JSON inválido" });
});
