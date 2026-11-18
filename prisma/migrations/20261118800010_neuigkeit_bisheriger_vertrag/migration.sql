-- Neuigkeit (18.11.2026): Vergleich mit dem bisherigen Vertrag auf der Vergleichsfolie (Paket P3b). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bisheriger_vertrag', 'Bisheriger Vertrag im Vergleich',
 'In der Terminvorbereitung tragen Sie unter den Tarifen über **Bisherigen Vertrag eintragen** den Vertrag ein, den Ihr Kunde schon hat: Versicherer und Tarif aus dem Katalog oder einfach Beitrag, Summe und Selbstbeteiligung. In der Präsentation steht er dann als Spalte „Ihr bisheriger Vertrag“ neben Ihren Tarifen, darunter der Unterschied im Jahresbeitrag und der nächste Kündigungstermin. Hat Ihr Kunde Versicherer und Tarif schon im Chat genannt, ist beides vorbelegt, und mit dem Schalter **In Präsentation** blenden Sie die Spalte aus.',
 'neu', 'software', '2026-11-18 04:33:00', '2026-11-18 04:33:00', '2026-11-18 04:33:00')
ON CONFLICT ("id") DO NOTHING;
