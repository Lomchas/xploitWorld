import { PrismaClient, Difficulty } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create levels
  const levels = [
    {
      name: "Level 1 - Basic Commands",
      slug: "level-1-basic-commands",
      description: "Learn basic Linux commands: ls, cat, pwd, whoami",
      difficulty: Difficulty.EASY,
      flag: "NULL{basic_commands_mastered}",
      orderIndex: 1,
    },
    {
      name: "Level 2 - File Permissions",
      slug: "level-2-file-permissions",
      description: "Understand chmod, chown, and file permissions",
      difficulty: Difficulty.EASY,
      flag: "NULL{permissions_unlocked}",
      orderIndex: 2,
    },
    {
      name: "Level 3 - Process Management",
      slug: "level-3-process-management",
      description: "Master ps, kill, top, and background processes",
      difficulty: Difficulty.MEDIUM,
      flag: "NULL{process_control}",
      orderIndex: 3,
    },
    {
      name: "Level 4 - Network Basics",
      slug: "level-4-network-basics",
      description: "Explore netstat, ping, curl, and network tools",
      difficulty: Difficulty.MEDIUM,
      flag: "NULL{network_recon}",
      orderIndex: 4,
    },
    {
      name: "Level 5 - Privilege Escalation",
      slug: "level-5-privilege-escalation",
      description: "Learn sudo, su, and privilege escalation techniques",
      difficulty: Difficulty.HARD,
      flag: "NULL{root_access}",
      orderIndex: 5,
    },
    {
      name: "Level 6 - The Final Challenge",
      slug: "level-6-final-challenge",
      description: "Combine all skills to breach the ultimate system",
      difficulty: Difficulty.NIGHTMARE,
      flag: "NULL{wargame_completed}",
      orderIndex: 6,
    },
  ];

  for (const level of levels) {
    await prisma.level.upsert({
      where: { slug: level.slug },
      update: level,
      create: level,
    });
    console.log(`  ✓ Level created: ${level.name}`);
  }

  console.log("✅ Seed completed successfully");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });