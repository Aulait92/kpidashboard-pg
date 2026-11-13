-- Vertriebsunterlagen: Makler-/Vertreter-Präsentation als PPTX und PDF
CREATE TABLE "SalesPresentation" (
    "id" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,

    CONSTRAINT "SalesPresentation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesPresentation_audience_format_key" ON "SalesPresentation"("audience", "format");
