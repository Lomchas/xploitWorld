-- CreateTable
CREATE TABLE "pvp_regions" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pvp_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvp_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "addressNumber" SERIAL NOT NULL,
    "balanceSats" BIGINT NOT NULL DEFAULT 0,
    "integrity" INTEGER NOT NULL DEFAULT 100,
    "energy" INTEGER NOT NULL DEFAULT 100,
    "energyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attackReadyAt" TIMESTAMP(3),
    "repairReadyAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "compromises" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvp_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvp_ledger" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "deltaSats" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvp_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvp_events" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "ordinal" BIGSERIAL NOT NULL,
    "peerId" TEXT,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "pvp_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pvp_receipts" (
    "profileId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvp_receipts_pkey" PRIMARY KEY ("profileId","requestId")
);

-- CreateIndex
CREATE UNIQUE INDEX "pvp_profiles_userId_key" ON "pvp_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_profiles_addressNumber_key" ON "pvp_profiles"("addressNumber");

-- CreateIndex
CREATE INDEX "pvp_profiles_regionId_lastSeenAt_idx" ON "pvp_profiles"("regionId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "pvp_profiles_regionId_score_id_idx" ON "pvp_profiles"("regionId", "score", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_profiles_regionId_aliasKey_key" ON "pvp_profiles"("regionId", "aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_ledger_profileId_reference_key" ON "pvp_ledger"("profileId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_events_ordinal_key" ON "pvp_events"("ordinal");

-- CreateIndex
CREATE INDEX "pvp_events_profileId_ordinal_idx" ON "pvp_events"("profileId", "ordinal");

-- CreateIndex
CREATE INDEX "pvp_events_profileId_kind_peerId_ordinal_idx" ON "pvp_events"("profileId", "kind", "peerId", "ordinal");

-- AddForeignKey
ALTER TABLE "pvp_profiles" ADD CONSTRAINT "pvp_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_profiles" ADD CONSTRAINT "pvp_profiles_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "pvp_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_ledger" ADD CONSTRAINT "pvp_ledger_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_events" ADD CONSTRAINT "pvp_events_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_receipts" ADD CONSTRAINT "pvp_receipts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Built-in arenas and database invariants
INSERT INTO "pvp_regions" ("id") VALUES ('na'), ('eu'), ('as'), ('sa'), ('af');

ALTER TABLE "pvp_profiles"
  ADD CONSTRAINT "pvp_profile_integrity_range" CHECK ("integrity" BETWEEN 0 AND 100),
  ADD CONSTRAINT "pvp_profile_energy_range" CHECK ("energy" BETWEEN 0 AND 100),
  ADD CONSTRAINT "pvp_profile_balance_nonnegative" CHECK ("balanceSats" >= 0),
  ADD CONSTRAINT "pvp_profile_config_object" CHECK (jsonb_typeof("config") = 'object');

ALTER TABLE "pvp_ledger"
  ADD CONSTRAINT "pvp_starter_ledger_amount" CHECK ("kind" <> 'starter' OR ("deltaSats" = 42000000000 AND "reference" = 'm2-starter'));
