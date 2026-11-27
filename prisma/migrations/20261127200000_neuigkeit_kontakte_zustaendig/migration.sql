-- Neuigkeit (27.11.2026, Teams: Kontakte nach Zuständigem filtern). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2711_kontakte_zustaendig', 'Kontakte nach Zuständigem filtern',
 'Arbeiten Sie im Team, zeigen Sie in **Kontakte** über den neuen Filter **Zuständig** nur die Kontakte einer Person, oder alle, die noch niemandem zugeteilt sind. Das geht in der Liste und in der Pipeline.',
 'neu', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
