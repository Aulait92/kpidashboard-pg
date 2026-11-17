-- Neuigkeit (17.11.2026): Angebot nach dem Termin senden und automatisch nachfassen (Paket P3). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_angebot_senden', 'Angebot nach dem Termin: senden und nachfassen lassen',
 'Nach dem Termin schicken Sie das Angebot der Gesellschaft mit **Angebot senden** (auf **Heute**, unter **Wie lief der Termin?** oder in der Terminvorbereitung) per WhatsApp und E-Mail an Ihren Kunden, als PDF mit Link und auf Wunsch mit dem Link zur Präsentation; haben Sie es selbst verschickt, genügt ein Tipp auf **Habe ich selbst gesendet**. Danach fasst die App nach (WhatsApp, eine E-Mail mit Rückruf-Knopf aus Ihren Vorlagen „Angebot“ und „Nachfassen Angebot“ sowie Anruf-Erinnerungen an Sie) und kündigt jeden automatischen Schritt am Vorabend per Push an, damit Sie ihn bei Bedarf am Kontakt anhalten.',
 'neu', 'software', '2026-11-17 19:30:00', '2026-11-17 19:30:00', '2026-11-17 19:30:00')
ON CONFLICT ("id") DO NOTHING;
