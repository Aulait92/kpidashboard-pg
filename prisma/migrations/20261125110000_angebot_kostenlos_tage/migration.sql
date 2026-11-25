-- Kostenloser Start nie länger als im Angebot gesetzt (Ole, 25.11.2026): Tage bis zum ersten Abrechnungstag einfrieren.
ALTER TABLE "Offer" ADD COLUMN "billingFreeStartTage" INTEGER;

-- Bestehende Angebote mit kostenlosem Start: Tage aus dem gespeicherten Start (so bleibt alles wie verschickt)
UPDATE "Offer" o SET "billingFreeStartTage" = x.tage
FROM (
  SELECT id, (CASE
      WHEN EXTRACT(DAY FROM s)::int <= "billingDay" THEN make_date(EXTRACT(YEAR FROM s)::int, EXTRACT(MONTH FROM s)::int, "billingDay")
      ELSE (make_date(EXTRACT(YEAR FROM s)::int, EXTRACT(MONTH FROM s)::int, "billingDay") + INTERVAL '1 month')::date
    END - s) AS tage
  FROM (SELECT id, "billingDay", ("startDate" AT TIME ZONE 'UTC')::date AS s FROM "Offer"
        WHERE "billingFreeStart" = true AND "billingDay" IS NOT NULL AND "startDate" IS NOT NULL) y
) x
WHERE o.id = x.id AND x.tage > 0;
