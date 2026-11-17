-- Neuigkeit (17.11.2026): weitere Standardprodukte in „Meine Provisionen“ (Zahn, Krankenzusatz, Pflege,
-- Krankentagegeld, Risikoleben, Grundfähigkeit, Basisrente, Sterbegeld) und eigene Produkte mit Rechenart
-- Sach, Leben oder Kranken. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_provisionen_produkte', 'Mehr Produkte in Ihren Provisionen',
 'Unter **Einstellungen → Meine Provisionen** finden Sie jetzt auch Zahnzusatz, Krankenzusatz, Pflegezusatz, Krankentagegeld, Risikoleben, Grundfähigkeit, Basisrente und Sterbegeld, jeweils mit passender Rechnung. Eigene Produkte legen Sie als Sach, Leben oder Kranken an: in Prozent vom Jahresbeitrag, in Promille der Beitragssumme oder in Monatsbeiträgen.',
 'neu', 'alle', '2026-11-17 19:00:00', '2026-11-17 19:00:00', '2026-11-17 19:00:00')
ON CONFLICT ("id") DO NOTHING;
