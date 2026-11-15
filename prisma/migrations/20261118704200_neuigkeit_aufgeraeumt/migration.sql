-- Neuigkeit: Oberfläche aufgeräumt (UX-Überarbeitung Etappe 1)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_aufgeraeumt', 'Übersichtlicher: Kontakte und Terminvorbereitung',
 'In **Kontakte** sehen Sie Phase und nächsten Schritt jetzt in getrennten Spalten, und der rote Zähler zeigt neue Kontakte, mit denen noch niemand gesprochen hat (Ansicht **Neu**). Im Kontakt öffnen Sie die **Präsentation** direkt am Termin, und in der **Terminvorbereitung** ist sie der Hauptknopf.',
 'verbessert', 'software', '2026-11-15 22:30:00', '2026-11-15 22:30:00', '2026-11-15 22:30:00')
ON CONFLICT ("id") DO NOTHING;
