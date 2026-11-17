-- Ole, 17.11.2026: „bei Stornos klare Stornos einfach annehmen, bei Grenzfällen 50:50“.
-- Neue Reklamationen entscheidet lib/ppl/storno.ts sofort. Die noch offenen Prüfungen (bisher „Sonstiges“ oder
-- Quote > 20 %, also Grenzfälle) werden einmalig 50:50 entschieden: halbe Gutschrift, Umsatz zur Hälfte bleibt.
WITH r AS (
  SELECT l."id" AS lead_id, rv."id" AS rev_id, COALESCE(rv."amount", 0) AS amount
  FROM "Lead" l
  LEFT JOIN LATERAL (SELECT "id", "amount" FROM "Revenue" WHERE "leadId" = l."id" ORDER BY "occurredAt" ASC LIMIT 1) rv ON TRUE
  WHERE l."stornoState" = 'review'
), upd_rev AS (
  UPDATE "Revenue" v SET "amount" = r.amount - ROUND(r.amount / 2, 2)
  FROM r WHERE v."id" = r.rev_id AND v."cancelled" = FALSE
  RETURNING v."id"
)
UPDATE "Lead" l SET "stornoState" = 'approved', "stornoDecidedAt" = NOW(), "status" = 'Storno', "creditAmount" = ROUND(r.amount / 2, 2)
FROM r WHERE l."id" = r.lead_id;
