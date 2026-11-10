-- Admin-A „Heute“: abgehakte oder auf später gelegte Punkte je Admin (nur hinzufügend).
CREATE TABLE "AdminDismissal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminDismissal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminDismissal_userId_until_idx" ON "AdminDismissal"("userId", "until");

CREATE UNIQUE INDEX "AdminDismissal_userId_key_key" ON "AdminDismissal"("userId", "key");

ALTER TABLE "AdminDismissal" ADD CONSTRAINT "AdminDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
