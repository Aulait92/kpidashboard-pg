-- Neuigkeit (23.11.2026): Hat die Nummer aus dem Formular kein WhatsApp und bucht der Lead online mit einer anderen
-- Handynummer, läuft WhatsApp ab dann über diese Nummer (lib/whatsapp/buchungsnummer.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_whatsapp_buchungsnummer', 'WhatsApp über die Nummer aus der Online-Buchung',
 'Hat die Nummer aus dem Formular kein WhatsApp und bucht Ihr Lead dann online mit einer anderen Handynummer, schreibt Ihr Assistent ab jetzt an diese Nummer: Bestätigung, Erinnerungen und Nachfassen kommen per WhatsApp, die SMS hören auf. Der Hinweis „Kein WhatsApp“ verschwindet, und im **Verlauf** beim Lead sehen Sie, welche Nummer gilt.',
 'verbessert', 'alle', '2026-11-23 15:00:00', '2026-11-23 15:00:00', '2026-11-23 15:00:00')
ON CONFLICT ("id") DO NOTHING;
