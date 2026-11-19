CREATE TABLE "campaign_runs" (
    "userId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "grades" JSONB NOT NULL DEFAULT '{}',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "branches" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "certificateCode" TEXT,
    "certificateScore" INTEGER,
    "certificateVariant" TEXT,
    "certificateIssuedAt" TIMESTAMP(3),

    CONSTRAINT "campaign_runs_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "campaign_runs_certificateCode_key" ON "campaign_runs"("certificateCode");

ALTER TABLE "campaign_runs" ADD CONSTRAINT "campaign_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
