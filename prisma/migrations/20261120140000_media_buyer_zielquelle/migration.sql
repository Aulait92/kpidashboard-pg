ALTER TABLE "MediaBuyerAction" ADD COLUMN "goalSource" TEXT;
ALTER TABLE "MediaBuyerAction" ADD COLUMN "regionNote" TEXT;
ALTER TABLE "MediaBuyerAction" ADD COLUMN "regionOverBreakEven" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaBuyerAction" ADD COLUMN "customersBehind" TEXT;
