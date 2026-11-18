-- Neuigkeit (18.11.2026): Tierkrankenversicherung, Gesundheitsfrage zum Tier nach der Buchung, oben in der Vorbereitung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_tier_gesundheit', 'Tierkrankenversicherung: Gesundheit des Tieres vorab',
 'Bei Anfragen zur Tierkrankenversicherung fragt Ihr Assistent nach der Buchung, ob das Tier gesund ist, und ergänzt nur, was im Formular fehlt. Die Antwort sehen Sie in der Terminvorbereitung ganz oben (**Termin → Vorbereiten**).',
 'verbessert', 'software', '2026-11-18 21:00:00', '2026-11-18 21:00:00', '2026-11-18 21:00:00')
ON CONFLICT ("id") DO NOTHING;
