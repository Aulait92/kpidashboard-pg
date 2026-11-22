-- Neuigkeit (22.11.2026): Ist die Nummer eines Leads nicht bei WhatsApp und sind die E-Mail-Funktionen aus, bekommt der Lead
-- jetzt bis zu zwei SMS mit Terminlink und Rückrufnummer, nur zu Geschäftszeiten. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_sms_ohne_whatsapp', 'Leads ohne WhatsApp bekommen eine SMS, auch ohne E-Mail',
 'Ist die Handynummer eines Leads nicht bei WhatsApp erreichbar und haben Sie die E-Mail-Funktionen ausgeschaltet, bekommt der Lead jetzt bis zu zwei kurze SMS in Ihrem Namen: mit Link zur Terminwahl und Ihrer Nummer für den Rückruf. Die SMS gehen nur zu Ihren Geschäftszeiten raus, und Sie sehen jede SMS im **Verlauf** beim Lead.',
 'neu', 'alle', '2026-11-22 19:00:00', '2026-11-22 19:00:00', '2026-11-22 19:00:00')
ON CONFLICT ("id") DO NOTHING;
