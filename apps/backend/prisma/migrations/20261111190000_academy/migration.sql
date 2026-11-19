CREATE TABLE "academy_licenses" (
    "userId" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "academy_licenses_pkey" PRIMARY KEY ("userId", "toolId")
);

CREATE TABLE "academy_progress" (
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "academy_progress_pkey" PRIMARY KEY ("userId", "lessonId")
);

ALTER TABLE "academy_licenses" ADD CONSTRAINT "academy_licenses_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "academy_progress" ADD CONSTRAINT "academy_progress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
