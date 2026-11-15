-- Bestandskunden-Modul vorerst für Kunden ausgeblendet (Ole, 15.11.2026): Schalter je Kunde, Standard aus.
-- Sichtbar bleibt es für Kunden mit aktivem Modul (existingCustomersEnabled) und für Oles Testkunden.
ALTER TABLE "Customer" ADD COLUMN "bestandSichtbar" BOOLEAN NOT NULL DEFAULT false;

-- Oles Testkunde „Ole Agentur“ und der Demo-Kunde der Google-Prüfung (nur, wenn es sie gibt)
UPDATE "Customer" SET "bestandSichtbar" = true WHERE "id" IN ('cmwhmxr7w03g436lb34w6xtsk', 'cust_google_review_demo');
