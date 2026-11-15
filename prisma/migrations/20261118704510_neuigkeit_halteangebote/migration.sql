-- Neuigkeit: Angebote je Grund beim Kündigen (Halteangebote)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_halteangebote', 'Passende Angebote, bevor Sie kündigen',
 'Geben Sie unter **Konto & Rechnungen → Vertrag hier kündigen** einen Grund an, sehen Sie jetzt passende Angebote, zum Beispiel einen Nachlass, eine Pause ohne Kosten, einen Neustart Ihrer Kampagne oder einen kostenlosen Wechsel der Sparte. „Trotzdem kündigen“ erreichen Sie weiterhin auf jedem Schritt mit einem Klick.',
 'neu', 'alle', '2026-11-15 19:30:00', '2026-11-15 19:30:00', '2026-11-15 19:30:00')
ON CONFLICT ("id") DO NOTHING;
