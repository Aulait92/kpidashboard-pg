-- Neuigkeit (17.11.2026): Strecke nach der Buchung (P2): sofort reserviert auch ohne E-Mail, Komplettcheck vorn, dann
-- Angaben fürs Angebot, Policen-Bitte genau einmal, Verträge im Schutz-Überblick, erste WhatsApp mit konkretem Interesse.
-- Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_strecke_nach_buchung', 'Nach der Buchung: erst das Wichtigste fürs Angebot',
 'Die erste WhatsApp an Ihre Leads nennt jetzt das konkrete Interesse (z. B. Haftpflicht und Hausrat), und ein gewählter Termin ist sofort reserviert, auch wenn die E-Mail-Adresse noch fehlt. Danach fragt Ihr Assistent kurz nach dem Komplettcheck, klärt zuerst die Angaben fürs Angebot und bittet jeden Lead einmal um seine bestehende Police. Genannte Verträge sehen Sie in der Terminvorbereitung unter **Ihr Schutz im Überblick** als „Woanders versichert“ mit Gesellschaft.',
 'verbessert', 'software', '2026-11-17 19:00:00', '2026-11-17 19:00:00', '2026-11-17 19:00:00')
ON CONFLICT ("id") DO NOTHING;
