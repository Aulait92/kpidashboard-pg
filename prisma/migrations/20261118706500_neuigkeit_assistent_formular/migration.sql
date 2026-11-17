-- Neuigkeit: Der WhatsApp-Assistent fragt nicht erneut, was im Leadformular steht (17.11.2026). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_assistent_formular', 'Assistent fragt nicht doppelt',
 'Ihr WhatsApp-Assistent nutzt die Angaben aus dem Leadformular, etwa berufliche Situation, Versicherungsinteresse oder E-Mail, und fragt sie nicht noch einmal ab. So kommt er mit weniger Nachrichten zum Termin. Zu sehen unter **Nachrichten**.',
 'verbessert', 'software', '2026-11-17 01:30:00', '2026-11-17 01:30:00', '2026-11-17 01:30:00')
ON CONFLICT ("id") DO NOTHING;
