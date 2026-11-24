-- @auch-beim-einmessen
-- Nachweis zum Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026): nur anhängen, wie
-- "PolicenNachweis". Der Trigger steht nicht im Prisma-Schema; auf einer leeren Datenbank misst scripts/migrate.mjs das
-- Schema ein und führt diese Datei trotzdem aus (Markierung oben). Wiederholbar geschrieben.
-- Ändern geht nie. Löschen nur bewusst (z. B. Aufräumen nach Ablauf der Aufbewahrung) mit
-- set_config('app.datennutzung_nachweis_loeschen', 'ja', true) in derselben Transaktion.
CREATE OR REPLACE FUNCTION datennutzung_nachweis_schutz() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'DatennutzungNachweis ist unveränderbar';
  END IF;
  IF coalesce(current_setting('app.datennutzung_nachweis_loeschen', true), '') <> 'ja' THEN
    RAISE EXCEPTION 'DatennutzungNachweis ist ein Nachweisprotokoll: nur anhängen';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "DatennutzungNachweis_nur_anhaengen" ON "DatennutzungNachweis";
CREATE TRIGGER "DatennutzungNachweis_nur_anhaengen"
BEFORE UPDATE OR DELETE ON "DatennutzungNachweis"
FOR EACH ROW EXECUTE FUNCTION datennutzung_nachweis_schutz();
