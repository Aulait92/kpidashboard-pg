-- Neuigkeit: KI-Hinweis im WhatsApp-Assistenten, Erstinformation, Einwilligung im Leadformular und STOPP (Ole 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_ki_hinweis_erstinformation', 'KI-Hinweis und Erstinformation im WhatsApp-Assistenten',
 'Ihr WhatsApp-Assistent sagt in der ersten Nachricht an jeden neuen Kontakt, dass hier eine KI schreibt, und schickt den Link zu Ihrer Erstinformation. Hinterlegen Sie dafür Status, Registernummer und Ihre Erstinformation unter **Einrichtung → Erstinformation für Ihre Leads**. Wer „Mensch“ schreibt, landet direkt bei Ihnen unter **Chats → Braucht dich**, und wer „STOPP“ schreibt, bekommt keine WhatsApp-Nachrichten mehr.',
 'neu', 'software', '2026-11-15 15:00:00', NULL, '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
