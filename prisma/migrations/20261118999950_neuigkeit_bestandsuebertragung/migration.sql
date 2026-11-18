-- Neuigkeit (18.11.2026): Bestandsübertragung aus der Maklervollmacht. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bestandsuebertragung', 'Bestandsübertragung aus der Maklervollmacht',
 'Sobald Ihr Kunde die Maklervollmacht unterschrieben hat, stehen seine Verträge als laufende Bestandsübertragung im Kontakt, und die App fragt nach 4 Wochen nach, ob die Gesellschaft übertragen hat. Mit einem Klick auf **Kontakt → Maklervollmacht → Bestätigt** zählt die Bestandscourtage in Ihren Zahlen, getrennt von Ihren Neuabschlüssen.',
 'neu', 'software', '2026-11-18 23:30:00', '2026-11-18 23:30:00', '2026-11-18 23:30:00')
ON CONFLICT ("id") DO NOTHING;
