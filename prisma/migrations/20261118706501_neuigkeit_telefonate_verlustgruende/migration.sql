-- Neuigkeiten (17.11.2026): Telefonate sauber erfassen (Assistent pausiert beim Anruf, Bedarf nach dem Gespräch,
-- Assistent fragt nur Offenes nach) und Verlustgründe in den Zahlen und im Monatsbericht. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_telefonate', 'Anrufe mit wenigen Tipps erfassen',
 'Tippen Sie in der App auf **Anrufen**, pausiert Ihr Assistent für diesen Lead, bis Sie das Ergebnis eingetragen haben. Danach fragt **Wie lief es?** kurz, was Sie besprochen haben, gern per Diktat. Nur was noch offen ist, fragt der Assistent anschließend per WhatsApp ab.',
 'neu', 'software', '2026-11-17 00:30:00', '2026-11-17 00:30:00', '2026-11-17 00:30:00'),
('upd_2611_verlustgruende', 'Warum Leads verloren gehen',
 'Unter **Wachstum** sehen Sie jetzt, warum Leads verloren gehen, im Vergleich zum Vorzeitraum und zum anonymen Schnitt aller Kunden, mit einem Tipp dazu. Ein Klick auf einen Grund zeigt die betroffenen Kontakte; auch der Monatsbericht nennt die zwei häufigsten Gründe.',
 'neu', 'software', '2026-11-17 00:31:00', '2026-11-17 00:31:00', '2026-11-17 00:31:00')
ON CONFLICT ("id") DO NOTHING;
