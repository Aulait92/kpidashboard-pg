-- Ole, 23.11.2026: Holger Kutschfreund nahm PG-2026-0164 (als Person) an und danach die neue Version PG-2026-0166
-- für seine Firma. Gültig ist nur PG-2026-0166; PG-2026-0164 gilt als ersetzt (nie bezahlt, kein Abo, kein Onboarding).
UPDATE "Offer" SET "status" = 'superseded', "paymentReminderAt" = NULL
WHERE "number" = 'PG-2026-0164' AND "status" = 'accepted' AND "paymentStatus" <> 'paid'
  AND "stripeSubscriptionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Onboarding" o WHERE o."offerId" = "Offer"."id");
