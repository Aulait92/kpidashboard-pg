-- Neuigkeit: Angaben zum Lead korrigieren und Karte „Ihre Buchungsseite“ unter Mein Kalender
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_lead_angaben', 'Angaben zum Lead korrigieren, Buchungslink schnell kopieren',
 'Tippfehler in Name, Telefonnummer oder E-Mail beheben Sie jetzt selbst: im Kontakt bei **Angaben zum Lead → Bearbeiten**. Die Änderung steht im Verlauf, und WhatsApp-Nachrichten laufen danach über die neue Nummer. Unter **Mein Kalender → Ihre Buchungsseite** kopieren Sie den Link, über den Interessenten selbst einen Termin buchen.',
 'neu', 'alle', '2026-11-14 15:45:00', '2026-11-14 15:45:00', '2026-11-14 15:45:00')
ON CONFLICT ("id") DO NOTHING;
