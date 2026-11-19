import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@null-protocol/shared";

export const SESSION_COOKIE = "null_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");
export const newSessionToken = (): string => randomBytes(32).toString("hex");

export function readSessionToken(
  cookie: string | undefined,
  name = SESSION_COOKIE,
): string | null {
  const value = cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name + "="))
    ?.slice(name.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export interface AuthenticatedSession {
  id: string;
  expiresAt: Date;
  user: SessionUser;
}
export async function authenticate(
  db: PrismaClient,
  request: Pick<IncomingMessage, "headers">,
  cookieName = SESSION_COOKIE,
): Promise<AuthenticatedSession | null> {
  const token = readSessionToken(request.headers.cookie, cookieName);
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { token: hashToken(token) },
    select: {
      id: true,
      expiresAt: true,
      user: { select: { id: true, username: true } },
    },
  });
  return session && session.expiresAt.getTime() > Date.now() ? session : null;
}
