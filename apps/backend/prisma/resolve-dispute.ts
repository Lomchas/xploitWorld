import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveDispute } from "../src/exchange/services";
import { isEntityId } from "../src/exchange/validation";

const db = new PrismaClient();
const [id, decision, ...words] = process.argv.slice(2);
const reason = words.join(" ").trim();
async function main(): Promise<void> {
  if (
    !isEntityId(id) ||
    (decision !== "pay" && decision !== "refund") ||
    !reason ||
    reason.length > 240
  )
    throw new Error(
      'Uso: pnpm resolve:dispute ID pay|refund "motivo del arbitraje"',
    );
  await resolveDispute(db, id, decision === "pay", reason);
  console.log("Disputa resuelta: " + id);
}
void main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Falló el arbitraje.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
