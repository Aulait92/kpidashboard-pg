-- Neuigkeit (19.11.2026): Präsentation im Termin mit Abschlussfolie „Ja, so machen wir es“ (Splittest, Teil der Termine),
-- Einwand-Folien und Sprechhinweise nur für den Vermittler; Zusage im Kundenlink mit Nachricht an den Vermittler. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_praesentation_abschluss', 'Präsentation: Einwände, Sprechhinweise und klarer Abschluss',
 'In der **Präsentation** im Termin finden Sie unter **Einwände** passende Folien zu „Zu teuer“, „Noch nachdenken“, „Schon versichert“ und „Erst mit Partner besprechen“, ein Tipp bringt Sie zurück. **Hinweise** zeigt Ihnen zu jeder Folie einen Satz, was Sie sagen oder fragen können, nur für Sie sichtbar. Bei einem Teil Ihrer Termine fasst die Folie **Ihre Entscheidung** Tarife, Beitrag und Beginn zusammen, mit **Ja, so machen wir es**; tippt Ihr Kunde das im Link an, bekommen Sie eine Nachricht.',
 'verbessert', 'software', '2026-11-19 06:00:00', '2026-11-19 06:00:00', '2026-11-19 06:00:00')
ON CONFLICT ("id") DO NOTHING;
