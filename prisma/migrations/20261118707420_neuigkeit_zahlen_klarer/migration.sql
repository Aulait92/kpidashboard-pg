-- Neuigkeit (17.11.2026): Zahlen auf Wachstum klarer (Verträge inkl. Cross-Selling, Bestandsprognose ab heute,
-- kurze Erklärungen, Tipp „Weiteres Produkt anbieten“ führt zu den passenden Kunden). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_zahlen_klarer', 'Ihre Zahlen, klarer erklärt',
 'Unter **Wachstum** sehen Sie bei der Abschlussprovision jetzt, wie viele Verträge dahinterstehen, inklusive Cross-Selling. Die Bestandsprovision **in 5 Jahren** rechnet genauer, und **So rechnen wir** erklärt alles in kurzen Stichpunkten. Der Tipp **Weiteres Produkt anbieten** zeigt mit einem Klick genau die passenden Kunden.',
 'verbessert', 'software', '2026-11-17 17:45:00', '2026-11-17 17:45:00', '2026-11-17 17:45:00')
ON CONFLICT ("id") DO NOTHING;
