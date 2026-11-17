-- Neuigkeit (17.11.2026, Nacht-QA): Der WhatsApp-Assistent fragt nicht erneut, was im Leadformular steht; von Hand
-- eingetragene Termine lassen sich ohne Kalender verschieben; Adresse aus dem Formular in den Kontaktdaten. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_assistent_formular', 'Assistent fragt nicht doppelt, Termine leichter verschieben',
 'Ihr WhatsApp-Assistent nutzt die Angaben aus dem Leadformular, etwa berufliche Situation, Versicherungsinteresse oder E-Mail, und fragt sie nicht noch einmal ab. Von Hand eingetragene Termine verschieben Sie jetzt auch ohne verbundenen Kalender unter **Kontakt → Verschieben**. Postleitzahl und Ort aus dem Formular stehen direkt in den Kontaktdaten.',
 'verbessert', 'software', '2026-11-17 00:30:00', '2026-11-17 00:30:00', '2026-11-17 00:30:00')
ON CONFLICT ("id") DO NOTHING;
