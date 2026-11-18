-- Neuigkeit (18.11.2026): Beratungsdokumentation nach dem Termin mit Bestätigung per Klick (Paket B). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_beratungsdoku', 'Beratungsdokumentation nach dem Termin',
 'Unter **Einstellungen → Beratung** schalten Sie die Beratungsdokumentation ein. Nach dem Termin tippen Sie im Kontakt an der Terminkarte auf **Beratungsdokumentation erstellen**: Wünsche, Beratung, Empfehlung, Entscheidung und Hinweise sind aus Ihrer Terminvorbereitung vorbefüllt, Sie ergänzen Ihre Begründung und senden sie als PDF per E-Mail. Ihr Kunde bestätigt den Erhalt mit einem Klick, das PDF liegt danach am Kontakt unter **Dokumente**.',
 'neu', 'software', '2026-11-18 04:36:00', '2026-11-18 04:36:00', '2026-11-18 04:36:00')
ON CONFLICT ("id") DO NOTHING;
