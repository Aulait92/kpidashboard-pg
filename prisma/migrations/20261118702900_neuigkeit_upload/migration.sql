-- Neuigkeit: einheitliche Datei-Auswahl mit Knopf, Ablegen per Ziehen und Prüfung von Format und Größe (Ole, 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_datei_upload', 'Dateien einfacher hochladen',
 'Überall, wo Sie Dateien hochladen (z. B. Ihre Erstinformation unter **Einrichtung**, den Import Ihrer Bestandskunden oder Dokumente am Lead), gibt es jetzt einen deutlichen Knopf. Sie können die Datei auch einfach hineinziehen, sehen Name und Größe vor dem Speichern und erfahren sofort, wenn Format oder Größe nicht passen.',
 'verbessert', 'alle', '2026-11-15 17:00:00', '2026-11-15 17:00:00', '2026-11-15 17:00:00')
ON CONFLICT ("id") DO NOTHING;
