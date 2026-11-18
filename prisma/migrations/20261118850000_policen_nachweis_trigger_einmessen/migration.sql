-- @auch-beim-einmessen
-- Schutz-Trigger für "PolicenNachweis" (aus 20261118725000_policen_nachweis_ablage). Er steht nicht im Prisma-Schema;
-- auf einer leeren Datenbank (CI, neue Umgebung) misst scripts/migrate.mjs das Schema ein und hätte ihn sonst nicht
-- angelegt. Wiederholbar geschrieben: auf bestehenden Datenbanken wird derselbe Trigger nur neu angelegt.
CREATE OR REPLACE FUNCTION policen_nachweis_schutz() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'PolicenNachweis ist unveränderbar';
  END IF;
  IF coalesce(current_setting('app.policen_nachweis_loeschen', true), '') <> 'ja' THEN
    RAISE EXCEPTION 'PolicenNachweis darf nur bei Art. 17 bzw. Vertragsende gelöscht werden';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "PolicenNachweis_nur_anhaengen" ON "PolicenNachweis";
CREATE TRIGGER "PolicenNachweis_nur_anhaengen"
BEFORE UPDATE OR DELETE ON "PolicenNachweis"
FOR EACH ROW EXECUTE FUNCTION policen_nachweis_schutz();
