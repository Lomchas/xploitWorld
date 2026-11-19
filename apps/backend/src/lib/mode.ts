import type { PrismaClient } from "@prisma/client";

export type GameMode = "story" | "pvp";
export type RuntimeMode = GameMode | "legacy";

export function sessionCookieName(mode: RuntimeMode, secure = false): string {
  if (mode === "legacy") return "null_session";
  return (secure ? "__Host-" : "") + "xwd_" + mode + "_session";
}

export async function verifyWorldDatabase(db: PrismaClient, mode: GameMode) {
  const identity = await db.worldIdentity.findUnique({ where: { id: 1 } });
  if (identity?.mode !== mode)
    throw new Error(
      "Base de datos incorrecta para " + mode + ". Ejecuta pnpm db:setup.",
    );
}
