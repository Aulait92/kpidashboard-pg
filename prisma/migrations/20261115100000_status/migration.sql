-- CreateTable
CREATE TABLE "StatusSample" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "app" TEXT NOT NULL,
    "leads" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "calendar" TEXT NOT NULL,
    "payments" TEXT NOT NULL,
    "jobs" TEXT NOT NULL,

    CONSTRAINT "StatusSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusIncident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "level" TEXT NOT NULL DEFAULT 'degraded',
    "component" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusIncident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StatusSample_at_idx" ON "StatusSample"("at");

-- CreateIndex
CREATE INDEX "StatusIncident_resolvedAt_startsAt_idx" ON "StatusIncident"("resolvedAt", "startsAt");
