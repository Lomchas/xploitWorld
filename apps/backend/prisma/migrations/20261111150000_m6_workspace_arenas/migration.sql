-- CreateEnum
CREATE TYPE "WorkspaceKind" AS ENUM ('DIRECTORY', 'TEXT', 'IMAGE');

-- AlterTable
ALTER TABLE "pvp_profiles" ADD COLUMN     "arenaVisit" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pvp_events" ADD COLUMN     "arenaVisit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "regionId" TEXT;

-- Attribute existing events to the profile's original arena before requiring the column.
UPDATE "pvp_events" AS event
SET "regionId" = profile."regionId"
FROM "pvp_profiles" AS profile
WHERE event."profileId" = profile."id";

ALTER TABLE "pvp_events" ALTER COLUMN "regionId" SET NOT NULL;

-- CreateTable
CREATE TABLE "workspace_entries" (
    "userId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" "WorkspaceKind" NOT NULL,
    "mode" INTEGER NOT NULL,
    "text" TEXT,
    "image" BYTEA,
    "mime" TEXT,
    "digest" TEXT,
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "version" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_entries_pkey" PRIMARY KEY ("userId","path")
);

-- CreateTable
CREATE TABLE "pvp_arena_records" (
    "profileId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "compromises" INTEGER NOT NULL,

    CONSTRAINT "pvp_arena_records_pkey" PRIMARY KEY ("profileId","regionId")
);

-- CreateTable
CREATE TABLE "pvp_links" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "encryption" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "pvp_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pvp_links_regionId_sourceId_closedAt_openedAt_idx" ON "pvp_links"("regionId", "sourceId", "closedAt", "openedAt");

-- CreateIndex
CREATE INDEX "pvp_links_regionId_targetId_closedAt_openedAt_idx" ON "pvp_links"("regionId", "targetId", "closedAt", "openedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_links_regionId_sourceId_targetId_protocol_port_key" ON "pvp_links"("regionId", "sourceId", "targetId", "protocol", "port");

-- CreateIndex
CREATE INDEX "pvp_events_profileId_regionId_ordinal_idx" ON "pvp_events"("profileId", "regionId", "ordinal");

-- AddForeignKey
ALTER TABLE "workspace_entries" ADD CONSTRAINT "workspace_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_arena_records" ADD CONSTRAINT "pvp_arena_records_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_arena_records" ADD CONSTRAINT "pvp_arena_records_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "pvp_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_links" ADD CONSTRAINT "pvp_links_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "pvp_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_links" ADD CONSTRAINT "pvp_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_links" ADD CONSTRAINT "pvp_links_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_events" ADD CONSTRAINT "pvp_events_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "pvp_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Add pilot arenas alongside the five existing arenas.
INSERT INTO "pvp_regions" ("id") VALUES ('bogota'), ('tokio');
