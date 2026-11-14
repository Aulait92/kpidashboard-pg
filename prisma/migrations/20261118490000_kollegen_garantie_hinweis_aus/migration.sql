-- Hinweis „Kollegen empfehlen“: Anlass „Garantie erreicht“ entfällt (Ole, 14.11.2026). Offene Hinweise schließen.
UPDATE "ReferralNudge" SET "closedAt" = now() WHERE "key" = 'garantie' AND "closedAt" IS NULL;
