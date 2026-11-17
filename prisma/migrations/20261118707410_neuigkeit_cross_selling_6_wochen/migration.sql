-- Neuigkeit (17.11.2026): Erinnerung „Weiteres Produkt anbieten?“ nach 6 statt 3 Wochen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_cross_selling_6_wochen', 'Weiteres Produkt anbieten: nach 6 Wochen',
 'Die Erinnerung **Weiteres Produkt anbieten?** erscheint jetzt 6 Wochen nach dem ersten Abschluss auf **Heute**. Dann ist die Police in der Regel angekommen und das Gespräch noch frisch; erkannte Lücken aus der Terminvorbereitung stehen direkt in der Aufgabe. Ein- und ausschalten können Sie die Erinnerung unter **Einstellungen → Meine Provisionen**.',
 'verbessert', 'software', '2026-11-17 17:30:00', '2026-11-17 17:30:00', '2026-11-17 17:30:00')
ON CONFLICT ("id") DO NOTHING;
