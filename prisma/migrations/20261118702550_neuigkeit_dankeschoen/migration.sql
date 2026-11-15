-- Neuigkeit: Dankeschön für Empfehlende mit Jahresgrenze, nicht an einen Abschluss gekoppelt (15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_dankeschoen_grenze', 'Dankeschön für Empfehlende: höchstens 15 € im Jahr',
 'Das Dankeschön unter **Empfehlungen & Bewertungen → Einstellungen** ist jetzt auf 15 € je Empfehler und Kalenderjahr begrenzt, die App zählt alle Empfehlungen einer Person zusammen. Es wird fällig, sobald ein Gespräch stattgefunden hat, unabhängig von einem Vertragsabschluss. Höhere Werte haben wir auf 15 € gesetzt.',
 'verbessert', 'software', '2026-11-15 15:00:00', NULL, '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
