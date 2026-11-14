-- Neuigkeit: Bestand-Import mit Jahresbeitrag, Vertragsstatus und Vorschau
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bestand_vertraege', 'Bestand: Jahresbeitrag, Vertragsstatus und Vorschau beim Import',
 'Beim Hochladen Ihrer Kundenliste unter **Bestand → Liste aktualisieren** können Sie jetzt auch Jahresbeitrag, Vertragsnummer, Versicherer, Vertragsstatus, Anrede und Firma zuordnen. Vor dem Übernehmen sehen Sie, wie viele Kunden mit wie vielen Verträgen ankommen; stornierte oder ruhende Verträge zählen nicht mehr als Chance.

Auf **Bestand** sehen Sie Ihr Beitragsvolumen pro Jahr, können Kunden nach Jahresbeitrag sortieren, und Kampagnen schreiben die Kunden mit dem höchsten Beitrag zuerst an.',
 'neu', 'software', '2026-11-14 09:15:00', '2026-11-14 09:15:00', '2026-11-14 09:15:00')
ON CONFLICT ("id") DO NOTHING;
