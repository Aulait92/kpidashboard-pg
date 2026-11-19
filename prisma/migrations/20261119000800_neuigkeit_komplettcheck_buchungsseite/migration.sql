-- Neuigkeit (19.11.2026): Komplettcheck auch nach der Buchung über die Buchungsseite, Komplettcheck-Frage mit dem
-- Nutzen „doppelt zahlen und sparen“, Buchungsseite übersichtlicher am Handy. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_komplettcheck_buchungsseite', 'Mehr Komplettchecks, auch über Ihre Buchungsseite',
 'Wer über Ihre Buchungsseite bucht, wird jetzt direkt danach gefragt, ob Sie im Termin auch kurz über die übrigen Versicherungen schauen sollen. Die Frage nennt den Nutzen konkret: wo Ihr Kunde vielleicht doppelt zahlt und sparen kann. Ihren Link finden Sie unter **Einstellungen → Mein Kalender → Ihre Buchungsseite**, den Wunsch Ihres Kunden wie gewohnt am Termin.',
 'verbessert', 'software', '2026-11-19 06:00:00', '2026-11-19 06:00:00', '2026-11-19 06:00:00')
ON CONFLICT ("id") DO NOTHING;
