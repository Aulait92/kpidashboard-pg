-- Neuigkeit: Kennzeichen „Kein WhatsApp“ in Pipeline und Kontakten (Ole, 16.11.2026; lib/kein-whatsapp-kennzeichen.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kein_whatsapp_kennzeichen', 'Kein WhatsApp auf einen Blick',
 'Ist ein Lead nicht per WhatsApp erreichbar, steht in Pipeline und Kontaktliste jetzt „Kein WhatsApp“, ein Tipp darauf ruft ihn direkt an. Alle diese Leads finden Sie unter **Kontakte → Nur ohne WhatsApp**.',
 'verbessert', 'software', '2026-11-16 07:00:00', '2026-11-16 07:00:00', '2026-11-16 07:00:00')
ON CONFLICT ("id") DO NOTHING;
