-- Neuigkeit (17.11.2026): Termin-Strecke des Assistenten (nur Video, Vermittler als Person, Angebotsfragen nach der
-- Buchung, Zusage), Anrede nicht mehr aus dem Vornamen. Ersetzt den Eintrag „Anrede automatisch“ vom 16.11.2026, der
-- nicht mehr zutrifft. Kein Push.
DELETE FROM "ProductUpdate" WHERE "id" = 'upd_2611_anrede_automatisch';
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_terminstrecke_video', 'Assistent: schneller zum Videotermin',
 'Ihr WhatsApp-Assistent schlägt nach höchstens zwei Fragen zwei konkrete Videotermine vor und nennt Sie dabei persönlich. Nach der Buchung fragt er nur noch, was Sie für die Beiträge brauchen, und am Termin sehen Sie „zugesagt“, sobald Ihr Lead ihn im Kalender hat. Leads spricht er nur mit Herr oder Frau an, wenn die Anrede bekannt ist. Nur Video oder auch Telefon stellen Sie unter **Einstellungen → Mein Kalender** ein, Ihre Anrede unter **Einrichtung → Erstinformation**.',
 'verbessert', 'software', '2026-11-17 11:55:00', '2026-11-17 11:55:00', '2026-11-17 11:55:00')
ON CONFLICT ("id") DO NOTHING;
