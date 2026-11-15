-- Neuigkeit: Assistent legt sich Wiedervorlagen, Verschieben per Chat
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_wiedervorlage_assistent', 'Assistent meldet sich wie besprochen wieder',
 'Bittet ein Lead, sich später zu melden (z. B. „morgen nochmal“), legt Ihr Assistent sich selbst eine Wiedervorlage und meldet sich zur vereinbarten Zeit per WhatsApp. Sie sehen sie im Kontakt unter den Aktionen. Termine verschiebt der Lead jetzt direkt im Chat: Er antwortet einfach, der Assistent schlägt neue Zeiten vor.',
 'neu', 'software', '2026-11-15 15:00:00', '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
