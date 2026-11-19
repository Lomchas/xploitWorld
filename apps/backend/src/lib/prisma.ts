import { config } from "../config";
import { PrismaClient } from "@prisma/client";
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: config.DATABASE_URL } },
    log: ["error"],
  });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
