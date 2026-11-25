-- @auch-beim-einmessen
-- Protokoll der Support-Zugriffe (Ole, 25.11.2026): nur anhängen, wie "PolicenNachweis" und "DatennutzungNachweis".
-- Der Trigger steht nicht im Prisma-Schema; auf einer leeren Datenbank misst scripts/migrate.mjs das Schema ein und
-- führt diese Datei trotzdem aus (Markierung oben). Wiederholbar geschrieben.
-- Ändern geht nie. Die App kennt keinen Löschweg; Löschen nur bewusst von Hand (z. B. Art. 17 oder Ablauf der
-- Aufbewahrung) mit set_config('app.support_zugriff_loeschen', 'ja', true) in derselben Transaktion.
CREATE OR REPLACE FUNCTION support_zugriff_schutz() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'SupportZugriff ist unveränderbar';
  END IF;
  IF coalesce(current_setting('app.support_zugriff_loeschen', true), '') <> 'ja' THEN
    RAISE EXCEPTION 'SupportZugriff ist ein Protokoll: nur anhängen';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "SupportZugriff_nur_anhaengen" ON "SupportZugriff";
CREATE TRIGGER "SupportZugriff_nur_anhaengen"
BEFORE UPDATE OR DELETE ON "SupportZugriff"
FOR EACH ROW EXECUTE FUNCTION support_zugriff_schutz();
