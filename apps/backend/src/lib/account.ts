import { randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  isRecord,
  type AccountCredentials,
  type AccountState,
  type SessionUser,
} from "@null-protocol/shared";
import { HttpError } from "./http";
import { hashToken, newSessionToken, SESSION_TTL_MS } from "./session";

const PREFIX = "xwd-key:";
const STORED_KEY = /^xwd-key:[a-f0-9]{64}$/;
const USERNAME = /^[a-z0-9][a-z0-9_-]{2,23}$/;
const KEY = /^xwd_[a-f0-9]{64}$/;

export function parseCredentials(body: unknown): AccountCredentials {
  if (
    !isRecord(body) ||
    Object.keys(body).length !== 2 ||
    typeof body.username !== "string" ||
    !USERNAME.test(body.username) ||
    typeof body.key !== "string" ||
    !KEY.test(body.key)
  )
    throw new HttpError(
      400,
      "Usa un operador válido y una clave de acceso XploitworlD.",
    );
  return { username: body.username, key: body.key };
}

function matchesKey(stored: string | undefined, key: string): boolean {
  const valid = !!stored && STORED_KEY.test(stored);
  const expected = valid ? stored.slice(PREFIX.length) : "0".repeat(64);
  return (
    timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(hashToken(key), "hex"),
    ) && valid
  );
}

export const isLinkedOperator = (user: {
  role: string;
  password: string;
}): boolean => user.role === "PLAYER" && STORED_KEY.test(user.password);

export async function accountState(
  db: PrismaClient,
  userId: string,
): Promise<AccountState> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      username: true,
      role: true,
      password: true,
      balanceSats: true,
      ledger: {
        select: { id: true, kind: true, deltaSats: true, createdAt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
      },
    },
  });
  return {
    username: user.username,
    linked: isLinkedOperator(user),
    balanceSats: user.balanceSats.toString(),
    movements: user.ledger.map((entry) => ({
      ...entry,
      deltaSats: entry.deltaSats.toString(),
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

/** Claim the current guest in place so its progress, PvP profile and ledger survive. */
export async function linkGuest(
  db: PrismaClient,
  userId: string,
  credentials: AccountCredentials,
): Promise<void> {
  try {
    const update = await db.user.updateMany({
      where: { id: userId, role: "GUEST" },
      data: {
        role: "PLAYER",
        username: credentials.username,
        password: PREFIX + hashToken(credentials.key),
      },
    });
    if (update.count === 1) return;
  } catch (error: unknown) {
    if (isRecord(error) && error.code === "P2002")
      throw new HttpError(409, "Ese nombre de operador ya está ocupado.");
    throw error;
  }
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { username: true, password: true, role: true },
  });
  if (
    user?.role === "PLAYER" &&
    user.username === credentials.username &&
    matchesKey(user.password, credentials.key)
  )
    return;
  throw new HttpError(409, "Esta sesión ya pertenece a una cuenta vinculada.");
}

export async function loginOperator(
  db: PrismaClient,
  credentials: AccountCredentials,
  previousSessionId?: string,
): Promise<{ user: SessionUser; token: string }> {
  const match = await db.user.findUnique({
    where: { username: credentials.username },
    select: { id: true, username: true, password: true, role: true },
  });
  if (!matchesKey(match?.password, credentials.key) || match?.role !== "PLAYER")
    throw new HttpError(
      401,
      "El operador o la clave de acceso son incorrectos.",
    );
  const token = newSessionToken();
  await db.$transaction(async (tx) => {
    await tx.session.create({
      data: {
        userId: match.id,
        token: hashToken(token),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    if (previousSessionId)
      await tx.session.deleteMany({ where: { id: previousSessionId } });
  });
  return { user: { id: match.id, username: match.username }, token };
}

export async function restoreMigratedAccount(
  db: PrismaClient,
  input: unknown,
  previousSessionId?: string,
) {
  if (
    !isRecord(input) ||
    typeof input.claim !== "string" ||
    !/^xwd_m65_[a-f0-9]{64}$/.test(input.claim)
  )
    throw new HttpError(400, "Introduce un código de migración válido.");
  const credentials = parseCredentials({
    username: input.username,
    key: input.key,
  });
  const claim = hashToken(input.claim);
  const token = newSessionToken();
  try {
    return await db.$transaction(async (tx) => {
      const old = await tx.migrationClaim.findUnique({
        where: { token: claim },
      });
      if (
        !old ||
        (await tx.migrationClaim.deleteMany({ where: { token: claim } }))
          .count !== 1
      )
        throw new HttpError(
          409,
          "Este código de migración ya no está disponible.",
        );
      const user = await tx.user.update({
        where: { id: old.userId },
        data: {
          username: credentials.username,
          role: "PLAYER",
          password: PREFIX + hashToken(credentials.key),
        },
        select: { id: true, username: true },
      });
      await tx.session.create({
        data: {
          userId: user.id,
          token: hashToken(token),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
      });
      if (previousSessionId)
        await tx.session.deleteMany({ where: { id: previousSessionId } });
      return { user, token };
    });
  } catch (error) {
    if (isRecord(error) && error.code === "P2002")
      throw new HttpError(409, "Ese nombre de operador ya está ocupado.");
    throw error;
  }
}

export async function createDemoOperator(db: PrismaClient) {
  const username = "demo-" + randomUUID().slice(0, 8);
  const key = "xwd_" + newSessionToken();
  const user = await db.user.create({
    data: {
      username,
      email: username + "@demo.invalid",
      password: PREFIX + hashToken(key),
      role: "PLAYER",
    },
    select: { id: true, username: true },
  });
  return { user, key };
}
