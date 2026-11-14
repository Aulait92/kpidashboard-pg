-- Standard-Empfehlungsangebot: Versicherungs-Check über alle Verträge (Ole, 14.11.2026).
-- Das Feld kam am selben Tag mit „none“ als Vorgabe; bestehende Einstellungen bekommen den Check.
-- Wer kein Angebot möchte, wählt „Kein Angebot“ wieder aus.
ALTER TABLE "ReviewSettings" ALTER COLUMN "offerKind" SET DEFAULT 'ordner';
UPDATE "ReviewSettings" SET "offerKind" = 'ordner' WHERE "offerKind" = 'none';
