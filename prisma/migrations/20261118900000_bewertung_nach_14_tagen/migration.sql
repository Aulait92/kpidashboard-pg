-- Datenmigration (Ole, 18.11.2026): Bewertungsanfrage nach 14 statt 7 Tagen. Neue Einträge haben seit
-- 20261118721000_abschluss_ein_tipp schon den Standard 14; bestehende mit dem alten Standard 7 werden angehoben.
-- Selbst gewählte andere Werte bleiben unverändert.
UPDATE "ReviewSettings" SET "reviewDelayDays" = 14 WHERE "reviewDelayDays" = 7;
