-- Neuigkeit: „Hat doch WhatsApp“ im Hinweis „Kein WhatsApp“ (Ole, 23.11.2026; app/buyer/stammdaten-actions.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_doch_whatsapp', 'Kein WhatsApp aufheben',
 'Steht bei einem Kontakt „Kein WhatsApp“, obwohl die Nummer WhatsApp hat, tippen Sie im Hinweis auf **Hat doch WhatsApp**. Der Assistent versucht es dann erneut per WhatsApp.',
 'verbessert', 'software', '2026-11-23 16:30:00', '2026-11-23 16:30:00', '2026-11-23 16:30:00')
ON CONFLICT ("id") DO NOTHING;
