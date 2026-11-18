-- Policen per WhatsApp nach der Rechtsprüfung (Ole, 18.11.2026): Nachweistabelle (nur anhängen), Ablage im privaten
-- Bucket, Freigabe Kranken/BU/Leben je Vermittler. Additiv.
ALTER TABLE "Customer" ADD COLUMN "policenIntern" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "policenAvvZugestimmtAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "policenAvvVersion" TEXT;
ALTER TABLE "Customer" ADD COLUMN "policenAvvUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "policenAvvSpaeter" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "policenDatenschutzUrl" TEXT;
-- Oles eigenes Konto (Name enthält „Kannapinn“): Gesundheitssparten sofort an (Ole, 18.11.2026). Testkunden über isTest.
UPDATE "Customer" SET "policenIntern" = true WHERE "name" ILIKE '%kannapinn%' AND "archived" = false;

ALTER TABLE "LeadDocument" ADD COLUMN "storageKey" TEXT;

CREATE TABLE "PolicenNachweis" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "phone" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "ki" BOOLEAN,
    "wortlaut" TEXT,
    "textVersion" TEXT,
    "datenschutzVersion" TEXT,
    "datenschutzUrl" TEXT,
    "waMessageId" TEXT,
    "frageWaMessageId" TEXT,
    "vermittlerUserId" TEXT,
    "vermittlerName" TEXT,
    "quelle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PolicenNachweis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PolicenNachweis_customerId_phone_createdAt_idx" ON "PolicenNachweis"("customerId", "phone", "createdAt");
CREATE INDEX "PolicenNachweis_leadId_createdAt_idx" ON "PolicenNachweis"("leadId", "createdAt");

-- Nur anhängen: kein UPDATE; DELETE nur mit SET LOCAL app.policen_nachweis_loeschen = 'ja' (Art. 17, Vertragsende)
CREATE OR REPLACE FUNCTION policen_nachweis_schutz() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PolicenNachweis ist unveränderbar';
  END IF;
  IF coalesce(current_setting('app.policen_nachweis_loeschen', true), '') <> 'ja' THEN
    RAISE EXCEPTION 'PolicenNachweis darf nur bei Art. 17 bzw. Vertragsende gelöscht werden';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PolicenNachweis_nur_anhaengen"
BEFORE UPDATE OR DELETE ON "PolicenNachweis"
FOR EACH ROW EXECUTE FUNCTION policen_nachweis_schutz();
