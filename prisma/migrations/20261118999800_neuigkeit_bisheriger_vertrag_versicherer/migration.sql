-- Neuigkeit (18.11.2026): alle Versicherer in der Auswahl, übliche Kündigungsfrist statt „laut Police prüfen“. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bisher_versicherer', 'Bisheriger Vertrag: alle Versicherer und Kündigungstermin',
 'Beim bisherigen Vertrag Ihres Kunden finden Sie jetzt alle gängigen Versicherer in der Auswahl. Nennt die Police keine Frist, zeigen Vorbereitung und Präsentation den Kündigungstermin mit der üblichen Frist von 3 Monaten (**Termin → Vorbereiten → Angebot erstellen**).',
 'verbessert', 'software', '2026-11-18 20:20:00', '2026-11-18 20:20:00', '2026-11-18 20:20:00')
ON CONFLICT ("id") DO NOTHING;
