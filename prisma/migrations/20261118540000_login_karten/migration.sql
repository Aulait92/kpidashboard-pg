-- Mehrere Infokarten auf der Login-Seite (nur hinzufügend). Die bisherige
-- Tabelle "LoginInfo" bleibt unverändert stehen (Altbestand).
CREATE TABLE "LoginCard" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "badge" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "linkText" TEXT,
    "linkUrl" TEXT,
    "image" BYTEA,
    "imageType" TEXT,
    "imagePath" TEXT,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginCard_key_key" ON "LoginCard"("key");

CREATE INDEX "LoginCard_enabled_position_idx" ON "LoginCard"("enabled", "position");
