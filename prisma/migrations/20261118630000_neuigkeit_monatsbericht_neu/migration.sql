-- Neuigkeit: Monatsbericht neu (Ergebnis im Betreff, Vertriebstrichter, Ergebnis als Rechnung, Bestand, Maßnahmen, Tipps)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_monatsbericht_neu', 'Ihr Monatsbericht zeigt jetzt mehr',
 'Ihr Monatsbericht zeigt jetzt Ihren Vertriebstrichter, Ihr Ergebnis im Monat als einfache Rechnung und wie Ihr Bestand in den nächsten 5 Jahren wächst, mit denselben Zahlen wie unter **Zahlen**. Dazu sehen Sie, was wir im Monat konkret für Ihre Anzeigen getan haben, und 1 bis 2 Tipps für den nächsten Monat. Alle Berichte finden Sie unter **Zahlen → Monatsberichte**.',
 'verbessert', 'alle', '2026-11-14 13:52:00', '2026-11-14 13:52:00', '2026-11-14 13:52:00')
ON CONFLICT ("id") DO NOTHING;
