-- Neuigkeit (17.11.2026): Assistent bucht eine freie Wunschzeit direkt und nennt in der Buchungsnachricht die Adresse der Einladung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_wunschzeit_einladung', 'Wunschtermin wird direkt gebucht',
 'Nennt ein Lead im Chat einen konkreten Wunschtermin, zum Beispiel „Mittwoch um 16 Uhr“, und Sie sind frei, bucht Ihr Assistent ihn jetzt direkt, ohne noch einmal zwei Zeiten zur Auswahl zu schicken. In der Buchungsnachricht steht außerdem, an welche E-Mail-Adresse die Einladung mit Kalendereintrag ging; nennt der Lead eine andere, geht die Einladung neu raus.',
 'verbessert', 'software', '2026-11-17 16:30:00', '2026-11-17 16:30:00', '2026-11-17 16:30:00')
ON CONFLICT ("id") DO NOTHING;
