-- Neuigkeit: Pipeline-Spalten „Im Gespräch“ und „Termin vereinbart“ für alle
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_pipeline_spalten', 'Pipeline: „Im Gespräch“ und „Termin vereinbart“',
 'In Ihrer **Pipeline** sehen Sie jetzt getrennt, wer im Chat geantwortet hat bzw. erreicht wurde (**Im Gespräch**) und wer schon einen Termin hat (**Termin vereinbart**). Bisher hieß die Spalte „In Beratung“.',
 'verbessert', 'alle', '2026-11-13 23:06:00', '2026-11-13 23:06:00', '2026-11-13 23:06:00')
ON CONFLICT ("id") DO NOTHING;
