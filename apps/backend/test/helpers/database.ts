import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/** Apply the tracked migrations to a schema owned by this test suite. */
export async function createTestDatabase(
  databaseUrl: string,
  schema: string,
): Promise<PrismaClient> {
  if (!/^null_test_[a-f0-9]{32}$/.test(schema))
    throw new Error("Invalid test schema name");
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    await db.$connect();
    await db.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
    const root = path.resolve(__dirname, "../../prisma/migrations");
    const folders = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL search_path TO "' + schema + '"');
        for (const folder of folders) {
          const sql = await readFile(
            path.join(root, folder, "migration.sql"),
            "utf8",
          );
          for (const statement of sql.split(";")) {
            const trimmed = statement.trim();
            if (trimmed && trimmed !== "BEGIN" && trimmed !== "COMMIT")
              await tx.$executeRawUnsafe(trimmed);
          }
        }
      },
      { timeout: 20_000 },
    );
    return db;
  } catch (error) {
    await db
      .$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE')
      .catch(() => undefined);
    await db.$disconnect();
    throw error;
  }
}
