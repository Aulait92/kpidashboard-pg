-- @auch-beim-einmessen
-- Trigger und Startwerte für "Lead"."statusChangedAt" (stehen nicht im
-- Prisma-Schema, deshalb läuft diese Migration auch beim Einmessen).
-- Wiederholbar geschrieben.
UPDATE "Lead" SET "statusChangedAt" = COALESCE("closedAt", "firstContactAt", "createdAt")
WHERE NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lead_status_changed_at');

CREATE OR REPLACE FUNCTION lead_status_changed_at() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" THEN
    NEW."statusChangedAt" := CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lead_status_changed_at ON "Lead";
CREATE TRIGGER lead_status_changed_at
  BEFORE UPDATE ON "Lead"
  FOR EACH ROW EXECUTE FUNCTION lead_status_changed_at();
