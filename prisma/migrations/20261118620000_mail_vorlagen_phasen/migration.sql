-- E-Mail-Vorlagen nach Phase (Ole, 14.11.2026): Standardvorlagen tragen einen festen Schlüssel,
-- der Kunde merkt sich, welcher Stand der Standardvorlagen schon ergänzt wurde. Nur additiv.
ALTER TABLE "MailTemplate" ADD COLUMN "standardKey" TEXT;
ALTER TABLE "Customer" ADD COLUMN "mailVorlagenStand" INTEGER NOT NULL DEFAULT 0;

-- Bisherige Standardvorlagen (gleiche Namen in Sie und Du) bekommen ihren Schlüssel.
UPDATE "MailTemplate" SET "standardKey" = CASE "name"
    WHEN 'Nicht erreicht' THEN 'nicht_erreicht'
    WHEN 'Angebot' THEN 'angebot'
    WHEN 'Nachfassen Angebot' THEN 'nachfassen_angebot'
    WHEN 'Nach dem Abschluss' THEN 'nach_abschluss'
  END
WHERE "standardKey" IS NULL AND "name" IN ('Nicht erreicht', 'Angebot', 'Nachfassen Angebot', 'Nach dem Abschluss');

-- Kunden mit Vorlagen haben Stand 1 (die ersten vier), die neuen kommen beim nächsten Laden dazu.
UPDATE "Customer" c SET "mailVorlagenStand" = 1
WHERE c."mailVorlagenStand" = 0 AND EXISTS (SELECT 1 FROM "MailTemplate" t WHERE t."customerId" = c."id");
