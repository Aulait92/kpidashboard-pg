-- Neuigkeit: Vertrag selbst kündigen mit Termin vorab und Bestätigung per E-Mail (Anwalts-Memo, Ole 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_vertrag_kuendigen', 'Vertrag direkt im Konto kündigen',
 'Unter **Konto & Rechnungen → Ihr Vertrag** können Sie Ihren Vertrag mit **Vertrag hier kündigen** selbst beenden. Vor dem Absenden sehen Sie, an welchem Tag der Vertrag endet, danach kommt sofort eine Bestätigung per E-Mail.',
 'neu', 'alle', '2026-11-15 15:00:00', NULL, '2026-11-15 15:00:00', '2026-11-15 15:00:00')
ON CONFLICT ("id") DO NOTHING;
