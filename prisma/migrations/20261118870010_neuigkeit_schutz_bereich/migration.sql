-- Neuigkeit (18.11.2026): „Was hat Frau Becker schon?“ als ein Bereich in der Terminvorbereitung statt „Chance im
-- Termin“ und Fenster „Schutz im Überblick“; alle Versicherungen über die Suche erreichbar. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_schutz_bereich', 'Bestehende Versicherungen direkt in der Vorbereitung',
 'In **Termin vorbereiten** steht unter den Versicherungen jetzt direkt „Was hat Frau Becker schon?“: je Versicherung „Ja, bei mir“, „Ja, woanders“ (mit Versicherer und Tarif aus der Liste), „Weiß nicht“ oder „Nein“, beantwortete Zeilen klappen zu. Über **+ Versicherung hinzufügen** finden Sie jede Versicherung, auch PKV, BU, Rente oder Kfz, und der Schalter **Ins Angebot** nimmt sie mit einem Tipp dazu. Die Tipps für das Gespräch stehen mit Glühbirne oben in derselben Liste.',
 'verbessert', 'software', '2026-11-18 08:50:00', '2026-11-18 08:50:00', '2026-11-18 08:50:00')
ON CONFLICT ("id") DO NOTHING;
