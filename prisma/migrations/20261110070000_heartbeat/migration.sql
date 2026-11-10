-- CreateTable
CREATE TABLE "SystemHeartbeat" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "SystemHeartbeat_pkey" PRIMARY KEY ("key")
);

