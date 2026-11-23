-- Ole, 23.11.2026: Fremde Nummern (kein Lead, keine Buchung, kein Assistent) erscheinen nicht mehr unter Nachrichten und
-- lösen nichts aus. Bestehende „Wartet auf Sie“-Markierungen solcher Chats aufheben.
UPDATE "Conversation" SET "needsAttention" = false, "attentionReason" = NULL, "attentionAt" = NULL
WHERE "leadId" IS NULL AND "botActive" = false AND "needsAttention" = true
  AND NOT EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = "Conversation"."id" AND m."direction" = 'internal' AND m."kind" = 'appointment_booked' AND m."sentBy" = 'lead');

-- Neuigkeit (kein Push)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_nur_leads_im_chat', 'Nachrichten zeigt nur noch Ihre Leads',
 'Schreibt Ihnen eine Nummer, die zu keinem Lead gehört, etwa ein privater Kontakt oder jemand, der ein Dokument schickt, erscheint der Chat nicht mehr unter **Nachrichten** und Sie bekommen dafür keine Mitteilung. So sehen Sie dort nur Gespräche mit Ihren Interessenten. Wird aus der Nummer später ein Lead, erscheint der Chat mit dem bisherigen Verlauf.',
 'verbessert', 'software', '2026-11-23 15:00:00', '2026-11-23 15:00:00', '2026-11-23 15:00:00')
ON CONFLICT ("id") DO NOTHING;
