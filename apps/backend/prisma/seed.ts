import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { MISSIONS } from "@null-protocol/shared";
import { seedMissions } from "../src/game/campaign/seed";

const prisma = new PrismaClient();
const mode = process.env.GAME_MODE;
if (mode !== "story" && mode !== "pvp")
  throw new Error("Define GAME_MODE para cargar el mundo.");
async function setup(mode: "story" | "pvp") {
  const state = await prisma.worldIdentity.upsert({
    where: { id: 1 },
    create: { id: 1, mode },
    update: {},
  });
  if (state.mode !== mode)
    throw new Error("La base de datos pertenece a otro modo.");
  if (mode === "story") await seedMissions(prisma);
}
void setup(mode)
  .then(() =>
    console.log(
      mode === "story"
        ? `Historia UNO · ${MISSIONS.length} niveles disponibles.`
        : "PvP · Arenas disponibles.",
    ),
  )
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Falló la carga de misiones.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
