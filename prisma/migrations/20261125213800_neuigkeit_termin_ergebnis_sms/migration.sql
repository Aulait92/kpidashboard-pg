-- Neuigkeit (25.11.2026): Push „Wie lief der Termin mit …?“ am Morgen danach und SMS-Erinnerung, wenn WhatsApp nicht ankommt. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_ergebnis_sms', 'Termine: Erinnerung per SMS und Ergebnis mit einem Tipp',
 'Fehlt nach einem Termin am nächsten Morgen noch das Ergebnis, bekommen Sie eine Mitteilung „Wie lief der Termin?“, ein Tipp öffnet direkt die Erfassung. Kommt eine Terminerinnerung per WhatsApp nicht an, erhält Ihr Lead automatisch eine kurze SMS mit Datum, Uhrzeit und Link zum Termin. Die Mitteilung schalten Sie unter **Einstellungen → Erinnerungen & Aufgaben** ab.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
