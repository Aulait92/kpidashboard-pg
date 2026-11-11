-- „Ich bin abwesend“: Abwesenheiten je Login (Urlaub/Krank/Sonstiges), nur hinzufügend.
CREATE TABLE "UserAbsence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'urlaub',
    "substituteUserId" TEXT,
    "createdById" TEXT,
    "movedTasks" JSONB,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAbsence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAbsence_customerId_endsAt_idx" ON "UserAbsence"("customerId", "endsAt");
CREATE INDEX "UserAbsence_userId_endsAt_idx" ON "UserAbsence"("userId", "endsAt");

ALTER TABLE "UserAbsence" ADD CONSTRAINT "UserAbsence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAbsence" ADD CONSTRAINT "UserAbsence_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserAbsence" ADD CONSTRAINT "UserAbsence_substituteUserId_fkey" FOREIGN KEY ("substituteUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
