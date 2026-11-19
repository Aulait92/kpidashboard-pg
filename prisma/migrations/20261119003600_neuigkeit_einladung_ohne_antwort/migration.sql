-- Neuigkeit (19.11.2026): Einladung mit Kalendereintrag auch ohne Bestätigung der Adresse (30 Min., kurzfristig 5 Min.),
-- ohne Adresse der Termin mit Links zum Eintragen per WhatsApp (lib/whatsapp/einladung-rueckfall.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einladung_ohne_antwort', 'Kalendereintrag auch ohne Antwort',
 'Antwortet Ihr Lead nach der Buchung nicht mehr, schickt Ihr Assistent die Einladung mit Kalendereintrag nach 30 Minuten trotzdem an die bekannte E-Mail-Adresse, bei Terminen in den nächsten 3 Stunden schon nach 5 Minuten. Ist keine Adresse bekannt, bekommt Ihr Lead den Termin per WhatsApp mit Links zum Eintragen in seinen Kalender.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
