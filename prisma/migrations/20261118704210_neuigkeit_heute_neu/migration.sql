-- Neuigkeit: „Heute“ nach Dringlichkeit (UX-Überarbeitung Etappe 2)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_heute_neu', '„Heute“ zeigt zuerst, was wartet',
 '**Heute** ist jetzt nach Dringlichkeit sortiert: zuerst Kontakte, die auf Ihre Antwort warten, dann Ihre Termine mit **Vorbereiten** direkt in der Zeile, dann Anrufe. Kontakte ohne nächsten Schritt finden Sie ganz unten unter **Aufräumen**, und am Rechner öffnet sich rechts gleich die erste Aufgabe.',
 'verbessert', 'software', '2026-11-16 00:30:00', '2026-11-16 00:30:00', '2026-11-16 00:30:00')
ON CONFLICT ("id") DO NOTHING;
