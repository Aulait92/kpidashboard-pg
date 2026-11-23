-- Neuigkeit (23.11.2026): Nach jeder Absage durch den Lead fragt der Assistent kurz danach per WhatsApp nach einem neuen
-- Termin (lib/absage-nachfassen.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_absage_nachfassen', 'Nach einer Absage fragt Ihr Assistent nach einem neuen Termin',
 'Sagt ein Lead seinen Termin selbst ab, fragt Ihr Assistent kurz danach freundlich per WhatsApp, ob er einen neuen Termin mit Ihnen finden soll. Die Nachricht steht vorher beim Lead unter **Nächste Nachrichten**, dort können Sie sie überspringen. Bucht der Lead neu oder antwortet er, entfällt sie.',
 'neu', 'alle', '2026-11-23 16:00:00', '2026-11-23 16:00:00', '2026-11-23 16:00:00')
ON CONFLICT ("id") DO NOTHING;
