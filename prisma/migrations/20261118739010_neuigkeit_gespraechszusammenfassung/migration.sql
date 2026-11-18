-- Neuigkeit (18.11.2026): Gesprächszusammenfassung mit dem Angebot (Paket M5). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_gespraechszusammenfassung', 'Gesprächszusammenfassung mit dem Angebot',
 'Beim Senden des Angebots über die App setzen Sie einen Haken bei **Gesprächszusammenfassung mitsenden**: Der Entwurf ist aus Ihrer Terminvorbereitung vorbefüllt (gewählte Tarife, Schutz im Überblick, offene Punkte, Notizen), Sie ergänzen die Gründe für Ihren Rat, sehen sie an und sie geht als PDF mit. Haben Sie das Angebot selbst geschickt, legen Sie die Zusammenfassung mit einem Tipp ab oder senden sie separat; sie liegt am Kontakt unter **Dokumente** als Beratungsdokumentation.',
 'neu', 'software', '2026-11-18 03:00:00', '2026-11-18 03:00:00', '2026-11-18 03:00:00')
ON CONFLICT ("id") DO NOTHING;
