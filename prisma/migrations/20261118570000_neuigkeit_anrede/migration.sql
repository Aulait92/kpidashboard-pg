-- Neuigkeit: Anrede „Guten Tag Frau Schneider“ bei Sie (WhatsApp-Assistent, Vorlagen, Termine, E-Mails)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_anrede', 'Passende Anrede bei „Sie“',
 'Bei der Ansprache „Sie“ beginnen Nachrichten an Ihre Leads und Kunden jetzt mit „Guten Tag Frau Schneider,“, wenn die Anrede aus dem Formular oder Ihrem Bestand bekannt ist, sonst mit vollem Namen oder „Guten Tag,“. Das gilt für den WhatsApp-Assistenten, die WhatsApp-Vorlagen, Termin-Nachrichten und E-Mail-Vorlagen. Die neuen Fassungen sehen Sie unter **Profilmenü → WhatsApp-Vorlagen**.',
 'verbessert', 'software', '2026-11-14 13:02:00', '2026-11-14 13:02:00', '2026-11-14 13:02:00')
ON CONFLICT ("id") DO NOTHING;
