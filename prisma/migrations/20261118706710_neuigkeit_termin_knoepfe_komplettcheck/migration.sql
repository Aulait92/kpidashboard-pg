-- Neuigkeit (17.11.2026): Terminwahl per Knopf im WhatsApp-Assistenten, Komplettcheck nach der Buchung mit bestehenden
-- Verträgen in Terminvorbereitung und Kontakt. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_knoepfe_komplettcheck', 'Assistent: Termin per Knopf und Komplettcheck',
 'Ihre Leads wählen den Videotermin jetzt mit einem Tipp auf eine der vorgeschlagenen Zeiten. Nach der Buchung fragt der Assistent, ob Sie im Termin auch die gesamte Absicherung ansehen sollen. Sagt Ihr Lead ja, sehen Sie **Komplettcheck gewünscht** und seine bestehenden Verträge in der **Terminvorbereitung** und im Kontakt.',
 'neu', 'software', '2026-11-17 12:50:00', '2026-11-17 12:50:00', '2026-11-17 12:50:00')
ON CONFLICT ("id") DO NOTHING;
