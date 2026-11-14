-- Neuigkeit: Rechenarten je Sparte (Leben/BU nach Beitragssumme, KFZ laufend, PKV-Tarifoptimierung als Honorar) und eigene Stornoquote
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_provision_rechenarten', 'Provision je Sparte genauer und eigene Stornoquote',
 'Leben, Rente, BU und Kindersparplan rechnen jetzt mit der Beitragssumme (Monatsbeitrag × 12 × Laufzeit), KFZ mit laufender Provision und die PKV-Tarifoptimierung mit Ihrem Honorar vom Kunden. Unter **Konto & Rechnungen → Meine Provisionen** gleichen Sie die vorausgefüllten Werte mit Ihrer Provisionsliste ab und tragen Ihre **Stornoquote pro Jahr** ein, mit der alle Prognosen rechnen.',
 'verbessert', 'alle', '2026-11-14 14:53:00', '2026-11-14 14:53:00', '2026-11-14 14:53:00')
ON CONFLICT ("id") DO NOTHING;
