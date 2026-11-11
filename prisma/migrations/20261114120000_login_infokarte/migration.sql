-- Infokarte auf der Login-Seite (nur hinzufügend)
CREATE TABLE "LoginInfo" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "badge" TEXT,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "linkText" TEXT,
    "linkUrl" TEXT,
    "image" BYTEA,
    "imageType" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginInfo_pkey" PRIMARY KEY ("id")
);
