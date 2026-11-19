-- CreateEnum
CREATE TYPE "InventoryState" AS ENUM ('READY', 'EQUIPPED', 'RESERVED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ListingState" AS ENUM ('OPEN', 'SOLD', 'CANCELED');

-- CreateEnum
CREATE TYPE "ServiceState" AS ENUM ('HIRED', 'DELIVERED', 'DISPUTED', 'PAID', 'REFUNDED');

-- CreateTable
CREATE TABLE "economy_lock" (
    "id" INTEGER NOT NULL,

    CONSTRAINT "economy_lock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "economy_receipts" (
    "profileId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "economy_receipts_pkey" PRIMARY KEY ("profileId","requestId")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "state" "InventoryState" NOT NULL DEFAULT 'READY',
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_listings" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT,
    "priceSats" BIGINT NOT NULL,
    "state" "ListingState" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_signals" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "rivalId" TEXT NOT NULL,
    "actorNode" INTEGER NOT NULL,
    "rivalNode" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "profileId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("profileId")
);

-- CreateTable
CREATE TABLE "service_offers" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceSats" BIGINT NOT NULL,
    "hours" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_contracts" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priceSats" BIGINT NOT NULL,
    "state" "ServiceState" NOT NULL DEFAULT 'HIRED',
    "hiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "evidenceId" TEXT,
    "evidence" TEXT,
    "disputedAt" TIMESTAMP(3),
    "dispute" TEXT,
    "settledAt" TIMESTAMP(3),
    "resolution" TEXT,
    "rating" INTEGER,

    CONSTRAINT "service_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_profileId_state_sku_idx" ON "inventory_items"("profileId", "state", "sku");

-- CreateIndex
CREATE INDEX "market_listings_state_createdAt_idx" ON "market_listings"("state", "createdAt");

-- CreateIndex
CREATE INDEX "market_listings_sellerId_state_idx" ON "market_listings"("sellerId", "state");

-- CreateIndex
CREATE INDEX "market_listings_buyerId_createdAt_idx" ON "market_listings"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "world_signals_createdAt_idx" ON "world_signals"("createdAt");

-- CreateIndex
CREATE INDEX "world_signals_actorId_kind_createdAt_idx" ON "world_signals"("actorId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "service_offers_active_updatedAt_idx" ON "service_offers"("active", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_offers_merchantId_kind_key" ON "service_offers"("merchantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "service_contracts_evidenceId_key" ON "service_contracts"("evidenceId");

-- CreateIndex
CREATE INDEX "service_contracts_clientId_hiredAt_idx" ON "service_contracts"("clientId", "hiredAt");

-- CreateIndex
CREATE INDEX "service_contracts_providerId_state_idx" ON "service_contracts"("providerId", "state");

-- AddForeignKey
ALTER TABLE "economy_receipts" ADD CONSTRAINT "economy_receipts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "pvp_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "pvp_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pvp_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_offers" ADD CONSTRAINT "service_offers_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("profileId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "service_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "pvp_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "pvp_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A single transactional lock serializes monetary operations across server instances.
INSERT INTO "economy_lock" ("id") VALUES (1);

CREATE UNIQUE INDEX "market_one_open_listing_per_item" ON "market_listings" ("itemId") WHERE "state" = 'OPEN';
CREATE UNIQUE INDEX "inventory_one_equipped_per_sku" ON "inventory_items" ("profileId", "sku") WHERE "state" = 'EQUIPPED';

ALTER TABLE "market_listings" ADD CONSTRAINT "market_valid_sale" CHECK (
  "priceSats" BETWEEN 100000000 AND 10000000000000 AND "sellerId" IS DISTINCT FROM "buyerId" AND
  (("state" = 'OPEN' AND "buyerId" IS NULL AND "closedAt" IS NULL) OR
   ("state" = 'SOLD' AND "buyerId" IS NOT NULL AND "closedAt" IS NOT NULL) OR
   ("state" = 'CANCELED' AND "buyerId" IS NULL AND "closedAt" IS NOT NULL))
);
ALTER TABLE "service_offers" ADD CONSTRAINT "service_offer_terms" CHECK (
  "priceSats" BETWEEN 100000000 AND 10000000000000 AND "hours" BETWEEN 1 AND 168
);
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contract_terms" CHECK (
  "priceSats" BETWEEN 100000000 AND 10000000000000 AND "clientId" <> "providerId" AND "dueAt" > "hiredAt" AND
  ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5 AND "state" = 'PAID')) AND
  (("state" IN ('PAID','REFUNDED')) = ("settledAt" IS NOT NULL)) AND
  (("state" IN ('DELIVERED','DISPUTED','PAID')) = ("deliveredAt" IS NOT NULL) OR "state" = 'REFUNDED') AND
  (("evidenceId" IS NULL) = ("evidence" IS NULL))
);
