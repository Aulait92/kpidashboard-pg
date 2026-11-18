-- Policen auslesen (Ole, 18.11.2026): Vertragsfelder je Unterlage für das Vergleichsblatt und Tageszähler (Bremse).
-- Additiv. Die Zeilen werden mit der Unterlage gelöscht (ON DELETE CASCADE).

CREATE TABLE "PolicenAuszug" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sparte" TEXT,
    "sparteQuelle" TEXT,
    "felder" JSONB,
    "anbieter" TEXT,
    "modell" TEXT,
    "ausgelesenAt" TIMESTAMP(3),
    "versuche" INTEGER NOT NULL DEFAULT 0,
    "geprueftAt" TIMESTAMP(3),
    "geprueftVonId" TEXT,
    "uebernommenAt" TIMESTAMP(3),
    "uebernommenVonId" TEXT,
    "existingContractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicenAuszug_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicenAuszug_documentId_key" ON "PolicenAuszug"("documentId");
CREATE INDEX "PolicenAuszug_leadId_idx" ON "PolicenAuszug"("leadId");
CREATE INDEX "PolicenAuszug_customerId_idx" ON "PolicenAuszug"("customerId");

ALTER TABLE "PolicenAuszug" ADD CONSTRAINT "PolicenAuszug_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicenAuszug" ADD CONSTRAINT "PolicenAuszug_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LeadDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PolicenAuslesenTag" (
    "tag" TEXT NOT NULL,
    "anzahl" INTEGER NOT NULL DEFAULT 0,
    "gemeldetAt" TIMESTAMP(3),

    CONSTRAINT "PolicenAuslesenTag_pkey" PRIMARY KEY ("tag")
);

CREATE TABLE "PolicenAuslesenEinstellung" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "zdrNachweisAm" TIMESTAMP(3),
    "zdrReferenz" TEXT,
    "zdrVonId" TEXT,
    "schluesselUngueltigAt" TIMESTAMP(3),
    "schluesselFinger" TEXT,
    "ungueltigGemeldetAt" TIMESTAMP(3),
    "ablaufGemeldetAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicenAuslesenEinstellung_pkey" PRIMARY KEY ("id")
);
