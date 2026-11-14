-- Cross-Selling (Ole, 14.11.2026): Verträge je Lead (LeadContract), Erinnerung „Weiteres Produkt anbieten?“,
-- Abgleich mit dem Bestand (ExistingCustomer.leadId, ExistingContract.leadContractId), weggeklickte Tipps auf /buyer/zahlen.
-- Nur hinzufügend; danach werden bestehende Abschlüsse (closedAt/closeValue) zum ersten Vertrag.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "crossSellReminder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "zahlenTipsDismissed" JSONB;

-- AlterTable
ALTER TABLE "ExistingContract" ADD COLUMN     "leadContractId" TEXT;

-- AlterTable
ALTER TABLE "ExistingCustomer" ADD COLUMN     "leadId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "crossSellRemindedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LeadContract" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "primaryLeadId" TEXT,
    "sparte" TEXT NOT NULL,
    "premium" DECIMAL(12,2),
    "provisionValue" DECIMAL(12,2),
    "signedAt" TIMESTAMP(3) NOT NULL,
    "insurer" TEXT,
    "contractNo" TEXT,
    "fileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aktiv',
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadContract_primaryLeadId_key" ON "LeadContract"("primaryLeadId");

-- CreateIndex
CREATE INDEX "LeadContract_customerId_signedAt_idx" ON "LeadContract"("customerId", "signedAt");

-- CreateIndex
CREATE INDEX "LeadContract_leadId_idx" ON "LeadContract"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ExistingContract_leadContractId_key" ON "ExistingContract"("leadContractId");

-- CreateIndex
CREATE UNIQUE INDEX "ExistingCustomer_leadId_key" ON "ExistingCustomer"("leadId");

-- AddForeignKey
ALTER TABLE "ExistingCustomer" ADD CONSTRAINT "ExistingCustomer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingContract" ADD CONSTRAINT "ExistingContract_leadContractId_fkey" FOREIGN KEY ("leadContractId") REFERENCES "LeadContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContract" ADD CONSTRAINT "LeadContract_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContract" ADD CONSTRAINT "LeadContract_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "LeadFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Datenmigration: bestehende Abschlüsse → erster Vertrag ──────────────────
-- Sparte aus dem Lead-Produkt (wie lib/provision.sparteForSource). Empfehlungs-Leads: Sparte aus dem
-- Produkt des Empfehlers, Leads aus Bestandskampagnen: aus dem Kampagnenthema, sonst „sonstiges“ (Sach-Standard).
-- Beitrag: Bei Produkten, die schon bisher mit Beitrag rechneten (PKV, Privatschutz, TKV), ist closeValue der
-- Beitrag. Sonst war closeValue der frei eingegebene Wert des Abschlusses: er bleibt als fester Provisionswert
-- (provisionValue), damit sich die bisherigen Zahlen nicht ändern. closedAt am Lead bleibt.
CREATE OR REPLACE FUNCTION pg_temp.sparte_of(src TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN src IS NULL OR btrim(src) = '' THEN NULL
    WHEN src ~* 'pkv' THEN 'pkv'
    WHEN src ~* 'privatschutz|haftpflicht|\yphv\y' THEN 'privatschutz'
    WHEN src ~* 'katze' THEN 'katze'
    WHEN src ~* 'hund' THEN 'hund'
    WHEN src ~* 'pferd' THEN 'pferd'
    WHEN src ~* '\ytkv\y|tierkranken|tierversicherung' THEN 'katze'
    WHEN src ~* 'unfall' THEN 'unfall'
    WHEN src ~* 'hausrat' THEN 'hausrat'
    WHEN src ~* 'geb(ä|a)ude' THEN 'wohngebaeude'
    WHEN src ~* 'rechtsschutz' THEN 'rechtsschutz'
    WHEN src ~* 'sparplan' THEN 'kindersparplan'
    WHEN src ~* '\ykfz\y|kraftfahrt|\yauto' THEN 'kfz'
    WHEN src ~* 'leben|\ybu\y|berufsunf' THEN 'leben_bu'
    ELSE NULL
  END
$$ LANGUAGE sql IMMUTABLE;

INSERT INTO "LeadContract" ("id", "leadId", "customerId", "primaryLeadId", "sparte", "premium", "provisionValue", "signedAt", "status", "createdAt", "updatedAt")
SELECT
  'lc_' || md5(l."id"),
  l."id",
  l."customerId",
  l."id",
  COALESCE(
    CASE WHEN l."referralLinkId" IS NOT NULL OR l."source" = 'Empfehlung' OR l."adChannel" = 'Empfehlung'
      THEN (SELECT pg_temp.sparte_of(rl_lead."source") FROM "ReferralLink" rl JOIN "Lead" rl_lead ON rl_lead."id" = rl."leadId" WHERE rl."id" = l."referralLinkId")
    END,
    CASE WHEN l."source" = 'Bestandskunde'
      THEN (SELECT pg_temp.sparte_of(cc."topic") FROM "CampaignRecipient" cr JOIN "CustomerCampaign" cc ON cc."id" = cr."campaignId" WHERE cr."leadId" = l."id" ORDER BY cr."sentAt" DESC NULLS LAST LIMIT 1)
    END,
    CASE WHEN l."referralLinkId" IS NULL AND COALESCE(l."source", '') NOT IN ('Empfehlung', 'Bestandskunde') AND COALESCE(l."adChannel", '') <> 'Empfehlung'
      THEN pg_temp.sparte_of(l."source") END,
    'sonstiges'
  ),
  CASE WHEN l."referralLinkId" IS NULL AND COALESCE(l."source", '') ~* 'pkv|privatschutz|\ytkv\y|tierkranken' AND l."closeValue" > 0 THEN l."closeValue" END,
  CASE WHEN NOT (l."referralLinkId" IS NULL AND COALESCE(l."source", '') ~* 'pkv|privatschutz|\ytkv\y|tierkranken') AND l."closeValue" > 0 THEN l."closeValue" END,
  COALESCE(l."closedAt", l."statusChangedAt", l."createdAt"),
  'aktiv',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Lead" l
WHERE lower(btrim(COALESCE(l."status", ''))) = 'abschluss'
ON CONFLICT DO NOTHING;
