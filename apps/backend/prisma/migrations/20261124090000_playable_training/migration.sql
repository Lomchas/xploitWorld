ALTER TABLE "academy_progress"
    ADD COLUMN "reportEs" TEXT,
    ADD COLUMN "reportEn" TEXT;

CREATE TABLE "arena_drill_completions" (
    "profileId" TEXT NOT NULL REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "drillId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "arena_drill_completions_pkey" PRIMARY KEY ("profileId", "drillId")
);
