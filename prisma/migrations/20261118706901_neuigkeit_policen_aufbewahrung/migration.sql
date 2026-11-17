-- Neuigkeit (17.11.2026): Unterlagen vom Kunden nach Abschluss 90 Tage mit Erinnerung, „behalten“, Widerruf mit einem Klick. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_policen_aufbewahrung', 'Unterlagen vom Kunden nach dem Abschluss',
 'Nach einem Abschluss bleiben die Unterlagen, die Ihr Kunde per WhatsApp geschickt hat, 90 Tage; zwei Wochen vorher erinnert Sie die App, sie in Ihre Kundenakte zu übernehmen. Brauchen Sie eine Unterlage für Ihre Beratungsdokumentation, tippen Sie im Kontakt unter **Dokumente** auf **Als Beratungsdokumentation behalten**. Widerruft ein Kunde am Telefon oder per E-Mail, löschen Sie dort alles mit **Einwilligung widerrufen / Unterlagen löschen**.',
 'verbessert', 'software', '2026-11-17 14:20:00', '2026-11-17 14:20:00', '2026-11-17 14:20:00')
ON CONFLICT ("id") DO NOTHING;
