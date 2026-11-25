-- Neuigkeit (25.11.2026, Auswertung Lohmann): Erst-SMS bei Leads ohne WhatsApp, Push an den Inhaber nach 30 Min. Wartezeit im Chat. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2511_erst_sms_antwort_push', 'SMS bei Leads ohne WhatsApp, Erinnerung bei offenen Antworten',
 'Kommt die erste WhatsApp bei einem neuen Lead nicht an, bekommt er jetzt eine SMS mit Ihrem Terminlink, auch ohne E-Mail-Adresse. Wartet ein Lead im Chat seit 30 Minuten auf eine Antwort aus Ihrem Team, bekommt der Inhaber einmal eine Mitteilung mit direktem Weg in **Nachrichten**.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
