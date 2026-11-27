-- Abmahnungen Az. H79MA, 6L4S8, LSD5Y (Ole, 27.11.2026): drei Vertriebskontakte auf Name und E-Mail reduzieren, wie in
-- der Art.-15-Auskunft beschrieben. Telefon, Anschrift, Webseite, Öffnungszeiten, Profile, Firma und Anreicherung
-- gelöscht; Mails und Verlauf bleiben als Beleg (Rechtsverteidigung). Nie kontaktieren gesetzt: die Instantly-Sperre
-- holt der Cron nach (instantlySperrenNachholen, instantlyGesperrtAt ist NULL). Gleiche Wirkung wie die Ops-Aktion
-- vertrieb_abmahnung_reduzieren. Idempotent.
UPDATE "SalesContact" SET
  "name" = COALESCE(NULLIF(TRIM(CONCAT_WS(' ', "firstName", "lastName")), ''), "email"),
  "detectedData" = NULL, "enrichment" = NULL,
  "phone" = NULL, "phoneDigits" = NULL, "phoneDigitsRev" = NULL, "street" = NULL, "zip" = NULL, "city" = NULL,
  "ratingValue" = NULL, "ratingCount" = NULL, "openingHours" = NULL, "url" = NULL, "description" = NULL,
  "googlePlaceId" = NULL, "googleMapsUrl" = NULL, "businessStatus" = NULL, "insurer" = NULL,
  "leaderNames" = NULL, "agencyType" = NULL, "teamSize" = NULL,
  "facebookUrl" = NULL, "instagramUrl" = NULL, "xingUrl" = NULL, "linkedinUrl" = NULL,
  "nieKontaktierenGrund" = COALESCE("nieKontaktierenGrund", 'manuell'),
  "nieKontaktierenAt" = COALESCE("nieKontaktierenAt", NOW())
WHERE "id" IN ('cmwyp3gh93vmh5op9uuyjpuzp', 'cmwxfamjr0ji85os0scjjjxjl', 'cmwsz5oau011q5opiew3q863t') AND "customerId" IS NULL;

DELETE FROM "SalesContactPhone" WHERE "contactId" IN ('cmwyp3gh93vmh5op9uuyjpuzp', 'cmwxfamjr0ji85os0scjjjxjl', 'cmwsz5oau011q5opiew3q863t');

DELETE FROM "SalesActivity"
WHERE "contactId" IN ('cmwyp3gh93vmh5op9uuyjpuzp', 'cmwxfamjr0ji85os0scjjjxjl', 'cmwsz5oau011q5opiew3q863t')
  AND ("note" LIKE 'Automatisch ergänzt%' OR "note" LIKE 'Adresse von der Website ergänzt%' OR "outcome" = 'Neue Telefonnummer erkannt');

INSERT INTO "SalesActivity" ("id", "contactId", "type", "outcome", "note", "occurredAt")
SELECT 'abm-red-' || c."id", c."id", 'NOTIZ', 'Daten reduziert',
       'Abmahnung: nur Name, E-Mail, Mails und Verlauf bleiben (Sperrliste, Rechtsverteidigung). Übrige Angaben gelöscht. Nie kontaktieren.', NOW()
FROM "SalesContact" c
WHERE c."id" IN ('cmwyp3gh93vmh5op9uuyjpuzp', 'cmwxfamjr0ji85os0scjjjxjl', 'cmwsz5oau011q5opiew3q863t')
ON CONFLICT ("id") DO NOTHING;
