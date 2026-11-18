-- Neuigkeit (18.11.2026): Gründe für den Rat als Vorschlag in Beratungsdokumentation und Gesprächszusammenfassung;
-- Frage „Beratungsdokumentation vorbereiten?“ in der Einrichtung und einmal nach dem ersten Termin-Ergebnis. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_gruende_vorschlag', 'Beratungsdokumentation: Gründe als Vorschlag',
 'Im Feld **Empfehlung mit Begründung** der Beratungsdokumentation und unter **Rat und Gründe** der Gesprächszusammenfassung schlägt die App die Gründe für Ihren Rat vor, aus den gewählten Tarifen und den Wünschen Ihres Kunden. Mit **Übernehmen** steht der Vorschlag im Feld, dort passen Sie ihn an. Ob die Beratungsdokumentation nach jedem Termin bereitliegen soll, entscheiden Sie mit einem Tipp unter **Einrichtung** oder **Einstellungen**.',
 'neu', 'software', '2026-11-18 10:24:00', '2026-11-18 10:24:00', '2026-11-18 10:24:00')
ON CONFLICT ("id") DO NOTHING;
