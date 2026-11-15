-- Gesprächsleitfaden und Sprechzettel entfernt (Ole, 15.11.2026): Neuigkeiten entsprechend anpassen
UPDATE "ProductUpdate" SET
  "title" = 'Termine vorbereiten mit Übersicht',
  "body" = 'Ab dem Vortag steht auf **Heute** die Aufgabe **Termine vorbereiten: Angebot rechnen**. Die Terminvorbereitung zeigt die Angaben Ihres Kunden in der Reihenfolge des Tarifrechners, die offenen Punkte für das Gespräch und die Unterlagen, auch **als PDF**. Mit **Vorbereitet** haken Sie die Aufgabe ab.',
  "updatedAt" = '2026-11-15 21:40:00'
WHERE "id" = 'upd_2611_termin_vorbereiten';
UPDATE "ProductUpdate" SET
  "body" = 'In der **Terminvorbereitung** tragen Sie Ihre Angebote ein und markieren Ihre Empfehlung. Ein Klick auf **Präsentation** erstellt daraus eine bebilderte Beratungsstrecke mit den Angaben Ihres Kunden, in den Farben Ihrer Gesellschaft. Im Videocall teilen Sie den Bildschirm. Als PDF zum Nachschicken gibt es sie auch.',
  "updatedAt" = '2026-11-15 21:40:00'
WHERE "id" = 'upd_2611_praesentation';
