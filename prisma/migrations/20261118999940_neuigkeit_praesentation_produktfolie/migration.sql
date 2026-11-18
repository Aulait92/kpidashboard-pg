-- Neuigkeit (18.11.2026): Präsentation im Termin, per „Mit anschauen“ dazugenommene Versicherung erscheint direkt hinter
-- „Ihr Schutz im Überblick“, das Deck springt hin; Reihenfolge des Hinzufügens bleibt, auch im Kundenlink. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_praesentation_produktfolie', 'Präsentation: dazugenommene Versicherung direkt im Blick',
 'Nehmen Sie im Termin auf **Ihr Schutz im Überblick** mit **Mit anschauen** eine Versicherung dazu, springt die Präsentation direkt auf ihre Auswahl mit den Preisen, Zurückblättern ist nicht mehr nötig. Weitere Versicherungen folgen in der Reihenfolge, in der Sie sie dazunehmen, und **Ihr Beitrag** rechnet alles mit. Der Link für Ihren Kunden zeigt dieselbe Reihenfolge.',
 'behoben', 'software', '2026-11-18 22:30:00', '2026-11-18 22:30:00', '2026-11-18 22:30:00')
ON CONFLICT ("id") DO NOTHING;
