-- Neuigkeit (17.11.2026): Kontakt mit Terminkarte (Hauptknopf je nach Zeit) und Einwilligung als Etikett bzw. Hinweis. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kontakt_termin_einwilligung', 'Kontakt: Termin und Einwilligung auf einen Blick',
 'Unter **Kontakte** steht im Kontakt Ihr Termin jetzt direkt unter den Aktionen, mit dem passenden Knopf zur richtigen Zeit: vorher **Vorbereiten**, ab 10 Minuten vor Beginn **Videocall starten** bzw. **Anrufen**, danach **Ergebnis eintragen** oder, wenn Ihr Kontakt da war, **Angebot senden**. Liegt die Einwilligung vollständig vor, sehen Sie das am Etikett **Einwilligung** neben dem Namen; antippen zeigt Zeitpunkt, Kanäle und Wortlaut. Fehlt sie oder hat sich Ihr Kontakt abgemeldet, sagt ein deutlicher Hinweis, was das bedeutet.',
 'verbessert', 'software', '2026-11-17 20:15:00', '2026-11-17 20:15:00', '2026-11-17 20:15:00')
ON CONFLICT ("id") DO NOTHING;
