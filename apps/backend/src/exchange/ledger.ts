import { Prisma, type PrismaClient } from "@prisma/client";
import { HttpError } from "../lib/http";

export type Tx = Prisma.TransactionClient;

export async function economyTransaction<T>(
  db: PrismaClient,
  operation: (tx: Tx) => Promise<T>,
): Promise<T> {
  try {
    return await db.$transaction(
      async (tx) => {
        await tx.economyLock.update({
          where: { id: 1 },
          data: { id: { increment: 0 } },
          select: { id: true },
        });
        return operation(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 12_000,
      },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2028", "P2034"].includes(error.code)
    )
      throw new HttpError(
        503,
        "La operación sigue ocupada. Reintenta con el mismo identificador.",
      );
    throw error;
  }
}

export async function moveBalance(
  tx: Tx,
  userId: string,
  deltaSats: bigint,
  kind: string,
  reference: string,
  now: Date,
): Promise<void> {
  const result = await tx.user.updateMany({
    where: {
      id: userId,
      ...(deltaSats < 0n ? { balanceSats: { gte: -deltaSats } } : {}),
    },
    data: { balanceSats: { increment: deltaSats } },
  });
  if (result.count !== 1)
    throw new HttpError(409, "Saldo insuficiente para esta operación.");
  await tx.walletEntry.create({
    data: { userId, deltaSats, kind, reference, createdAt: now },
  });
}
