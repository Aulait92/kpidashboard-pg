-- Neuigkeit: Anleitung „WhatsApp verbinden“ zum aktuellen Ablauf (Einladung per E-Mail, Anmeldung, Meta)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_whatsapp_anleitung', 'WhatsApp verbinden: Anleitung zum neuen Ablauf',
 'Die Anleitung unter **Einrichtung → WhatsApp verbinden** zeigt jetzt genau den aktuellen Ablauf: Einladung per E-Mail, Anmeldung bei 360dialog, Nummer bestätigen und das Fenster von Meta, mit Bildern und einem neuen Video. Nach der Einladung sehen Sie die nächsten Schritte direkt unter „So geht es bei 360dialog und Meta weiter“, und nach dem Verbinden wechselt die Anzeige von selbst auf „Verbunden“.',
 'verbessert', 'software', '2026-11-15 19:55:00', '2026-11-15 19:55:00', '2026-11-15 19:55:00')
ON CONFLICT ("id") DO NOTHING;
