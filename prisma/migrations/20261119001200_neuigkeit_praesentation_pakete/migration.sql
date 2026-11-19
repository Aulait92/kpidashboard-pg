-- Neuigkeit (19.11.2026): Präsentation Fassung C im Splittest (Ole hat C freigegeben, läuft ab dem Deploy in einem Teil
-- der Termine): Entscheidung mit zwei Paketen, Wahl auch im Kundenlink, Vermerk in der Beratungsdokumentation. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_praesentation_pakete', 'Präsentation: Entscheidung mit zwei Paketen',
 'In einem Teil Ihrer Termine zeigt die **Präsentation** auf **Ihre Entscheidung** jetzt zwei Pakete: Ihre Empfehlung und eine etwas günstigere Variante, jeweils mit Beitrag und dem Unterschied. Ihr Kunde wählt im Termin oder später im Link und sagt dann mit **Ja, so machen wir es** zu. Wählt er die günstigere Variante, steht das schon in der **Beratungsdokumentation** unter „Entscheidung des Kunden“, Sie können den Text wie gewohnt anpassen.',
 'verbessert', 'software', '2026-11-19 08:06:00', '2026-11-19 08:06:00', '2026-11-19 08:06:00')
ON CONFLICT ("id") DO NOTHING;
