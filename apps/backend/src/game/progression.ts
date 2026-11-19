import type { PrismaClient } from "@prisma/client";
import { prerequisiteSlugs } from "@null-protocol/shared";

export async function completedSlugs(db: PrismaClient, userId: string) {
  const rows = await db.userProgress.findMany({
    where: { userId, completed: true, level: { isActive: true } },
    select: { level: { select: { slug: true } } },
  });
  return new Set(rows.map((row) => row.level.slug));
}

export async function meetsPrerequisites(
  db: PrismaClient,
  userId: string,
  slug: string,
): Promise<boolean> {
  const required = prerequisiteSlugs(slug);
  if (!required.length) return true;
  const completed = await completedSlugs(db, userId);
  return required.every((item) => completed.has(item));
}
