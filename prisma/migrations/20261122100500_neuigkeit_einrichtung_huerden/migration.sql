-- Neuigkeit (22.11.2026): Hürden aus der Go-live-Prüfung der Einrichtung behoben (Nummer bei anderem WhatsApp-Anbieter,
-- Einladung an private E-Mail, Videoraum ohne Google/Microsoft, Test-Einladung beim App-Kalender). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung_huerden', 'Einrichtung: weniger Stolpersteine beim Start',
 'In der **Einrichtung** helfen wir jetzt bei typischen Hürden: Läuft Ihre WhatsApp-Nummer noch bei einem anderen Anbieter, zeigen wir, wie Sie sie freigeben lassen, und die Einladung zum Verbinden schicken Sie auf Wunsch an Ihre private E-Mail. Ohne Google- oder Microsoft-Kalender tragen Sie Ihren festen Link für Videotermine ein, und mit dem App-Kalender prüfen Sie per Test-Einladung, ob Ihre Termine ankommen.',
 'verbessert', 'software', '2026-11-22 10:05:00', '2026-11-22 10:05:00', '2026-11-22 10:05:00')
ON CONFLICT ("id") DO NOTHING;
