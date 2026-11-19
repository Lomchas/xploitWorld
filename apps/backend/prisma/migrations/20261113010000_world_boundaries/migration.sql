CREATE TABLE "world_identity" (
  "id" INTEGER NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL,
  "legacyImport" TEXT,
  CONSTRAINT "world_identity_singleton" CHECK ("id" = 1 AND "mode" IN ('story', 'pvp'))
);
CREATE TABLE "migration_claims" (
  "token" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE
);
ALTER TABLE "pvp_profiles" ADD COLUMN "hostname" TEXT;
