-- Neuigkeit (18.11.2026): „So arbeitet Ihr Assistent“ mit Beispielchat (Paket P8), Service-Mails in der Einrichtung (M9),
-- Antwortweg und Vorschläge in „Nächste Nachrichten“ (M7). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_so_arbeitet', 'So arbeitet Ihr Assistent: auf einen Blick',
 'Unter **Einstellungen → Assistent → Ablauf** sehen Sie jetzt auf einer Zeitleiste, was Ihr Kunde tut, was Ihr Assistent übernimmt und in welchen fünf Momenten Sie gefragt sind, dazu einen Beispielchat in Ihrem Produkt, mit Ihrem Namen und in Ihrer Ansprache. Im Kontakt stehen unter **Nächste Nachrichten** außerdem Vorschläge wie die Willkommens-Mail oder die Kündigung des alten Vertrags, und unter **Einstellungen → Assistent** sehen Sie, wohin die Antworten Ihrer Kunden gehen.',
 'neu', 'software', '2026-11-18 04:00:00', '2026-11-18 04:00:00', '2026-11-18 04:00:00')
ON CONFLICT ("id") DO NOTHING;
