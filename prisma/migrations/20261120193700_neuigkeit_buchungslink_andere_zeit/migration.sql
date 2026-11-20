-- Neuigkeit (20.11.2026): Nach dem zweiten „Andere Zeit“ schickt der WhatsApp-Assistent den Buchungslink mit. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_buchungslink_andere_zeit', 'Buchungslink, wenn keine Zeit passt',
 'Passen Ihrem Lead auch die zweiten Terminvorschläge im WhatsApp-Chat nicht, schickt der Assistent ihm jetzt zusätzlich den Link zu Ihrer Buchungsseite, Name und E-Mail sind dort schon eingetragen. Bucht er darüber, steht der Termin wie gewohnt im Chat unter **Nachrichten**.',
 'verbessert', 'software', '2026-11-20 18:36:00', '2026-11-20 18:36:00', '2026-11-20 18:36:00')
ON CONFLICT ("id") DO NOTHING;
