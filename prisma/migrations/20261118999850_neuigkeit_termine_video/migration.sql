-- Neuigkeit (18.11.2026): Termine per Video mit Ausnahmen auf Wunsch, Frage nach dem Kalendereintrag nach der Buchung,
-- Allianz-Online-Kalender mit verständlicher Meldung, Google-Konto sichtbar, „Versicherer“ in der Einrichtung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termine_video', 'Termine per Video, Kalendereintrag nachgefragt',
 'Ihr Assistent schlägt Ihren Kunden jetzt immer einen Videotermin vor; Telefon oder einen Termin vor Ort in der Agentur bietet er nur an, wenn ein Kunde das ausdrücklich wünscht und Sie es unter **Einstellungen → Assistent → Termine** erlauben. Nach der Buchung fragt er, ob Ihr Kunde den Termin im Kalender eintragen konnte, und schickt ihn bei Bedarf noch einmal zum Eintragen. Unter **Einrichtung → Kalender** sehen Sie, welches Google-Konto verbunden ist, und beim Allianz-Online-Kalender eine klare Meldung mit dem nächsten Schritt, falls der Abruf gerade nicht möglich ist.',
 'verbessert', 'software', '2026-11-18 20:30:00', '2026-11-18 20:30:00', '2026-11-18 20:30:00')
ON CONFLICT ("id") DO NOTHING;
