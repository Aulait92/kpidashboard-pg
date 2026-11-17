-- Neuigkeit (17.11.2026): Strecke nach der Buchung (P2): kurze Bestätigung, Zeit sofort geblockt, Komplettcheck vorn
-- (45 Min. bzw. zwei längere Zeiten), Angaben fürs Angebot, Adresse am Schluss bestätigen, Einladung genau einmal,
-- Verträge im Schutz-Überblick, erste WhatsApp mit konkretem Interesse. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_strecke_nach_buchung', 'Nach der Buchung: kurz bestätigt, das Wichtige zuerst',
 'Die erste WhatsApp nennt jetzt das konkrete Interesse Ihres Leads, und eine Buchung bestätigt Ihr Assistent kurz mit Termin und Link; die Zeit ist sofort in Ihrem Kalender geblockt. Danach fragt er nach dem Komplettcheck (mit 45 Minuten, wenn Ihr Kalender es zulässt, sonst mit zwei passenden längeren Zeiten), klärt die Angaben fürs Angebot und lässt am Ende die E-Mail-Adresse bestätigen; die Einladung mit Kalendereintrag geht dann genau einmal und mit der richtigen Dauer raus. Genannte Verträge sehen Sie in der Terminvorbereitung unter **Ihr Schutz im Überblick** als „Woanders versichert“ mit Gesellschaft.',
 'verbessert', 'software', '2026-11-17 19:00:00', '2026-11-17 19:00:00', '2026-11-17 19:00:00')
ON CONFLICT ("id") DO NOTHING;
