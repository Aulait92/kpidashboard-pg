-- AlterTable
ALTER TABLE "LinkedInSettings" ADD COLUMN     "focus" TEXT NOT NULL DEFAULT 'Hauptprodukt ist die Tierkrankenversicherung (Katze und Hund): Die meisten Posts drehen sich darum (Leads, Abschlüsse, Cross-Selling aus TKV-Kunden). PKV nur selten und dann ausschließlich als PKV-Optimierung nach §204 VVG (Tarifwechsel beim eigenen Versicherer), nie als PKV-Neugeschäft. Andere Sparten nur am Rand.',
ALTER COLUMN "icp" SET DEFAULT 'Versicherungsvermittler in Deutschland: Ausschließlichkeitsvertreter (z. B. Allianz-Agenturen), Mehrfachagenten und Makler, die mehr Neukunden wollen. Sie verkaufen z. B. Tierkrankenversicherung, Privatschutz und PKV. Wir verkaufen ihnen Leadgenerierung über Meta-Werbung plus unsere Software mit WhatsApp-Assistent, der Leads qualifiziert und Termine bucht.';


-- Zielgruppen-Text: TKV zuerst nennen (nur wenn noch der alte Standard drinsteht)
UPDATE "LinkedInSettings" SET "icp" = REPLACE("icp", 'Sie verkaufen z. B. PKV, Privatschutz und Tierkrankenversicherung.', 'Sie verkaufen z. B. Tierkrankenversicherung, Privatschutz und PKV.');
