BEGIN;

-- Preserve existing wallets while making Exchange available before PvP deployment.
ALTER TABLE "users" ADD COLUMN "balanceSats" BIGINT NOT NULL DEFAULT 0;
UPDATE "users" u SET "balanceSats" = p."balanceSats"
FROM "pvp_profiles" p WHERE p."userId" = u."id";
ALTER TABLE "users" ADD CONSTRAINT "wallet_balance_nonnegative" CHECK ("balanceSats" >= 0);
ALTER TABLE "pvp_profiles" DROP COLUMN "balanceSats";

ALTER TABLE "pvp_ledger" DROP CONSTRAINT "pvp_ledger_profileId_fkey";
ALTER TABLE "pvp_ledger" RENAME TO "wallet_entries";
ALTER TABLE "wallet_entries" RENAME CONSTRAINT "pvp_ledger_pkey" TO "wallet_entries_pkey";
ALTER TABLE "wallet_entries" RENAME COLUMN "profileId" TO "userId";
ALTER INDEX "pvp_ledger_profileId_reference_key" RENAME TO "wallet_entries_userId_reference_key";
UPDATE "wallet_entries" w SET "userId" = p."userId"
FROM "pvp_profiles" p WHERE w."userId" = p."id";
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_entries_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "wallet_entries_userId_kind_createdAt_idx" ON "wallet_entries" ("userId", "kind", "createdAt");
ALTER TABLE "wallet_entries" DROP CONSTRAINT "pvp_starter_ledger_amount";
ALTER TABLE "wallet_entries" ADD CONSTRAINT "wallet_starter_amount" CHECK (
  "kind" <> 'starter' OR
  ("reference" = 'm2-starter' AND "deltaSats" = 42000000000) OR
  ("reference" = 'm64-starter' AND "deltaSats" = 2000000000)
);
CREATE UNIQUE INDEX "wallet_one_starter_per_user" ON "wallet_entries" ("userId") WHERE "kind" = 'starter';

ALTER TABLE "economy_receipts" DROP CONSTRAINT "economy_receipts_profileId_fkey";
ALTER TABLE "economy_receipts" RENAME COLUMN "profileId" TO "userId";
UPDATE "economy_receipts" e SET "userId" = p."userId"
FROM "pvp_profiles" p WHERE e."userId" = p."id";
ALTER TABLE "economy_receipts" ADD CONSTRAINT "economy_receipts_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_profileId_fkey";
ALTER TABLE "inventory_items" RENAME COLUMN "profileId" TO "userId";
ALTER INDEX "inventory_items_profileId_state_sku_idx" RENAME TO "inventory_items_userId_state_sku_idx";
UPDATE "inventory_items" i SET "userId" = p."userId"
FROM "pvp_profiles" p WHERE i."userId" = p."id";
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep the equipped unit first, then an available or reserved unit. Retire
-- duplicates without breaking their old listings or idempotency receipts.
WITH ranked AS (
  SELECT i.*, row_number() OVER (
    PARTITION BY i."userId", i."sku"
    ORDER BY CASE i."state" WHEN 'EQUIPPED' THEN 0 WHEN 'READY' THEN 1 ELSE 2 END, i."acquiredAt", i."id"
  ) AS unit
  FROM "inventory_items" i
  WHERE i."state" <> 'CONSUMED' AND i."sku" IN ('cpu', 'ssd', 'scanner', 'workshop', 'case')
), duplicates AS (
  SELECT r."id", r."userId", coalesce(
    (SELECT m."priceSats" FROM "market_listings" m
      JOIN "pvp_profiles" buyer ON buyer."id" = m."buyerId"
      WHERE m."itemId" = r."id" AND m."state" = 'SOLD' AND buyer."userId" = r."userId"
      ORDER BY m."closedAt" DESC, m."id" DESC LIMIT 1),
    (SELECT -w."deltaSats" FROM "economy_receipts" e
      JOIN "wallet_entries" w ON w."userId" = e."userId" AND w."reference" = 'shop:' || e."requestId"
      WHERE e."userId" = r."userId" AND e."result"->>'id' = r."id" AND w."kind" = 'shop-buy'
      LIMIT 1),
    0
  ) AS refund
  FROM ranked r WHERE r.unit > 1
), retired AS (
  UPDATE "inventory_items" i SET "state" = 'CONSUMED'
  FROM duplicates d WHERE i."id" = d."id"
), canceled AS (
  UPDATE "market_listings" m SET "state" = 'CANCELED', "closedAt" = CURRENT_TIMESTAMP
  FROM duplicates d WHERE m."itemId" = d."id" AND m."state" = 'OPEN'
), refunds AS (
  INSERT INTO "wallet_entries" ("id", "userId", "reference", "kind", "deltaSats")
  SELECT 'm64-refund-' || "id", "userId", 'duplicate:' || "id", 'duplicate-refund', refund
  FROM duplicates WHERE refund > 0
  RETURNING "userId", "deltaSats"
)
UPDATE "users" u SET "balanceSats" = u."balanceSats" + r.total
FROM (SELECT "userId", sum("deltaSats")::BIGINT AS total FROM refunds GROUP BY "userId") r
WHERE u."id" = r."userId";

CREATE UNIQUE INDEX "inventory_one_permanent_per_user" ON "inventory_items" ("userId", "sku")
WHERE "state" <> 'CONSUMED' AND "sku" IN ('cpu', 'ssd', 'scanner', 'workshop', 'case');

CREATE TABLE "duty_attempts" (
  "userId" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "stage" INTEGER NOT NULL,
  "retryAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "duty_attempts_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "duty_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "service_contracts"
ADD COLUMN "description" TEXT,
ADD COLUMN "scope" JSONB,
ADD COLUMN "report" TEXT,
ADD COLUMN "effect" TEXT,
ADD COLUMN "feePercent" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "service_contracts" DROP CONSTRAINT "service_contract_terms";
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contract_terms" CHECK (
  "priceSats" BETWEEN 100000000 AND 10000000000000 AND "clientId" <> "providerId" AND "dueAt" > "hiredAt" AND
  "feePercent" BETWEEN 0 AND 100 AND
  ("rating" IS NULL OR ("rating" BETWEEN 1 AND 5 AND "state" = 'PAID')) AND
  (("state" IN ('PAID','REFUNDED')) = ("settledAt" IS NOT NULL)) AND
  (("state" IN ('DELIVERED','DISPUTED','PAID')) = ("deliveredAt" IS NOT NULL) OR "state" = 'REFUNDED') AND
  (("scope" IS NULL AND "report" IS NULL AND (("evidenceId" IS NULL) = ("evidence" IS NULL))) OR
   (jsonb_typeof("scope") IS NOT DISTINCT FROM 'object' AND "evidenceId" IS NULL AND
    (("report" IS NULL) = ("evidence" IS NULL)) AND (("report" IS NULL) = ("deliveredAt" IS NULL))))
);
CREATE INDEX "service_contracts_state_dueAt_idx" ON "service_contracts" ("state", "dueAt");
CREATE INDEX "service_contracts_state_deliveredAt_idx" ON "service_contracts" ("state", "deliveredAt");

COMMIT;
