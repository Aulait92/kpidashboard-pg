-- @auch-beim-einmessen
-- Nachweisprotokoll „Datenschutz und Recht“ (Ole, 19.11.2026): nur anhängen. Der Trigger steht nicht im Prisma-Schema;
-- auf einer leeren Datenbank misst scripts/migrate.mjs das Schema ein und führt diese Datei trotzdem aus (Markierung
-- oben). Wiederholbar geschrieben: auf bestehenden Datenbanken wird derselbe Trigger nur neu angelegt.
CREATE OR REPLACE FUNCTION datenschutz_fall_nur_anhaengen() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'DatenschutzFallEreignis ist ein Nachweisprotokoll: nur anhängen, kein Ändern oder Löschen';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "DatenschutzFallEreignis_nur_anhaengen" ON "DatenschutzFallEreignis";
CREATE TRIGGER "DatenschutzFallEreignis_nur_anhaengen"
BEFORE UPDATE OR DELETE ON "DatenschutzFallEreignis"
FOR EACH ROW EXECUTE FUNCTION datenschutz_fall_nur_anhaengen();
