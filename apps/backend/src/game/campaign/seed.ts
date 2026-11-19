import type { PrismaClient } from "@prisma/client";
import { MISSIONS } from "@null-protocol/shared";

const previousFlags: Readonly<Record<string, string>> = {
  "level-1-basic-commands": "NULL{basic_commands_mastered}",
  "level-2-file-permissions": "NULL{permissions_unlocked}",
  "level-3-process-management": "NULL{process_control}",
  "level-4-network-basics": "NULL{network_recon}",
  "level-5-privilege-escalation": "NULL{root_access}",
  "level-6-final-challenge": "NULL{wargame_completed}",
  "chapter-1-ciudad-borrada": "XWD{eco7_vanta_mercado_cero}",
  "chapter-2-mercado-cero": "XWD{lote_017_el_contrato_sigue_vivo}",
  "chapter-3-protocolo-olvido": "XWD{vanta_regresa_a_la_red}",
};

export async function seedMissions(db: PrismaClient) {
  await db.$transaction(
    MISSIONS.map(({ slug, name, description, difficulty }, index) => {
      const level = {
        slug,
        name,
        description,
        difficulty,
        flag: previousFlags[slug] ?? "CAMPAIGN:" + slug,
        orderIndex: index + 1,
        isActive: true,
      };
      return db.level.upsert({ where: { slug }, update: level, create: level });
    }),
  );
}
