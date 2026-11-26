-- Neuigkeit (26.11.2026, „Weiter auf WhatsApp“ nach der Online-Buchung, Nachfrage zur Vorbereitung früher). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_whatsapp_nach_buchung', 'Nach der Online-Buchung direkt weiter per WhatsApp',
 'Wer über Ihre **Buchungsseite** einen Termin bucht, kommt danach mit einem Klick in den WhatsApp-Chat und beantwortet dort gleich die kurzen Fragen zur Vorbereitung. Antwortet jemand nicht, fragt Ihr Assistent schon nach etwa drei Stunden einmal nach, nur tagsüber.

Die Antworten stehen wie gewohnt in der **Terminvorbereitung**.',
 'verbessert', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
