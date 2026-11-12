-- Vertriebskontakte maximal anreichern (Website + Google Places). Nur hinzufügend.
ALTER TABLE "SalesContact" ADD COLUMN "webEnrichAt" TIMESTAMP(3),
ADD COLUMN "googleCheckedAt" TIMESTAMP(3),
ADD COLUMN "googlePlaceId" TEXT,
ADD COLUMN "googleMapsUrl" TEXT,
ADD COLUMN "businessStatus" TEXT,
ADD COLUMN "insurer" TEXT,
ADD COLUMN "enrichment" JSONB;

-- CreateTable
CREATE TABLE "PlacesUsage" (
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlacesUsage_pkey" PRIMARY KEY ("day")
);
