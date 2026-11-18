-- Tarif-Lernen (Ole, 18.11.2026): Merkmalwerte, die Vermittler zu einem im Katalog fehlenden Tarifnamen eingetragen haben,
-- gehen als Entwurf mit in den Katalog-Export. Nur eine neue Spalte.
ALTER TABLE "TarifVorschlag" ADD COLUMN "werte" JSONB;
