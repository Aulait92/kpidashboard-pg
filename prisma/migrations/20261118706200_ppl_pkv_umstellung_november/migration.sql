-- PKV-Umstellung Zapier/Airtable → App (Ole, 16.11.2026). Läuft NACH dem Airtable-Import der Bezüge
-- (Abgleich über airtableId); ohne importierte Bezüge ändert sie nichts. Wiederholbar.

-- 1) Restziele November (die App zählt ab 0, Airtable-Lieferungen des Monats abgezogen). Am 1.12. wieder volle Ziele.
UPDATE "LeadSubscription" SET "goal" = 5, "updatedAt" = now() WHERE "airtableId" = 'recnP3ZHevph4Hgxs';                    -- Dennis Müller 30 − 25
UPDATE "LeadSubscription" SET "goal" = 7, "updatedAt" = now() WHERE "airtableId" = 'recKik4hja6EKhkuy';                    -- HvK München 15 − 8
UPDATE "LeadSubscription" SET "goal" = 13, "updatedAt" = now() WHERE "airtableId" = 'rechwC8VDQRfaZBJ3';                   -- HvK Stuttgart/Karlsruhe 30 − 17
UPDATE "LeadSubscription" SET "goal" = 2, "active" = false, "updatedAt" = now() WHERE "airtableId" = 'rec8nfxg2ZJ8RXZtg';  -- Daniel Seidel 30 − 28, bleibt inaktiv
UPDATE "LeadSubscription" SET "goal" = 30, "active" = false, "updatedAt" = now() WHERE "airtableId" = 'recDg0F980VakhHFL'; -- Edris: Ziel erreicht, inaktiv
UPDATE "LeadSubscription" SET "active" = false, "updatedAt" = now() WHERE "airtableId" = 'receO9PTPFS9yVLnR';              -- Privatschutz Anid: läuft weiter über Meta/Zapier

-- 2) HvK: Lieferung an die Leadbörse (Pivacom) wie im alten Auslieferungs-Zap. {brokercode} kommt aus PPL_HVK_BROKERCODE.
UPDATE "LeadSubscription"
SET "delivery" = 'email',
    "deliveryEmail" = 'leads@pivacom.com',
    "emailFormat" = 'standard',
    "emailSubject" = 'Neuer Lead - Performancegrowth',
    "emailTemplate" = E'Brokercode: {brokercode}\nArt: KVV-Opt\nGeprüft: nein\nAnrede: {anrede}\nName: {nachname}\nVorname: {vorname}\nStrasse: Unbekannt\nPLZ: {plz}\nOrt: {ort}\nGeburtsdatum: {geburtsdatum}\nBerufsstatus: {berufsstatus}\nEmail: {email}\nTel_mobil: {telefon}\nLeadgen_ID: {id}\nWo versichert: {versicherer}\nWie versichert: {versicherungsart}\nMonatsbeitrag: {beitrag}',
    "label" = CASE "airtableId" WHEN 'recKik4hja6EKhkuy' THEN 'HvK München' ELSE 'HvK Stuttgart/Karlsruhe' END,
    "updatedAt" = now()
WHERE "airtableId" IN ('recKik4hja6EKhkuy', 'rechwC8VDQRfaZBJ3');

-- 3) Bestehende HvK-Bezüge: ihre PLZ als „Gebiet mit Vorrang“ (Menge = Restziel November), damit HvK dort immer zuerst bekommt.
INSERT INTO "SubscriptionArea" ("id", "subscriptionId", "label", "plzRanges", "quantity", "period", "createdAt", "updatedAt")
SELECT 'area_hvk_' || CASE s."airtableId" WHEN 'recKik4hja6EKhkuy' THEN 'muenchen' ELSE 'stuttgart' END, s."id",
       CASE s."airtableId" WHEN 'recKik4hja6EKhkuy' THEN 'München' ELSE 'Stuttgart/Karlsruhe' END,
       s."plzRanges", s."goal", 'month', now(), now()
FROM "LeadSubscription" s
WHERE s."airtableId" IN ('recKik4hja6EKhkuy', 'rechwC8VDQRfaZBJ3') AND COALESCE(s."plzRanges", '') <> '' AND s."goal" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- 4) Zwei neue HvK-Bezüge mit Gebieten (Einstellungen wie HvK München: 45 €, keine schwachen < 450, 21 Gesellschaften,
--    Vorlage an Pivacom, Storno von Hand). Ohne eigenes Ziel: Kontingent = Gebietsmenge.
INSERT INTO "LeadSubscription" (
  "id", "customerId", "productKey", "label", "active", "status", "testQuantity", "testDays", "period", "goal", "startDate", "price",
  "plzRanges", "acceptWeak", "weakThreshold", "acceptCivilServants", "onlyWeak", "scoreFloor", "insurerInclude", "insurerExclude", "excludeRules",
  "stornoDays", "stornoReasons", "stornoAutoApprove", "delivery", "deliveryEmail", "emailSubject", "emailTemplate", "emailFormat", "consentText",
  "slackNotify", "webhookUrl", "webhookFormat", "webhookSecretEnc", "airtableId", "createdAt", "updatedAt")
SELECT n.id, s."customerId", s."productKey", n.label, true, 'live', NULL, NULL, 'month', NULL, TIMESTAMP '2026-11-16 00:00:00', s."price",
  NULL, s."acceptWeak", s."weakThreshold", s."acceptCivilServants", s."onlyWeak", s."scoreFloor", s."insurerInclude", s."insurerExclude", s."excludeRules",
  s."stornoDays", s."stornoReasons", s."stornoAutoApprove", s."delivery", s."deliveryEmail", s."emailSubject", s."emailTemplate", s."emailFormat", s."consentText",
  s."slackNotify", NULL, 'standard', NULL, NULL, now(), now()
FROM "LeadSubscription" s
CROSS JOIN (VALUES ('ppl_hvk_frankfurt', 'HvK Frankfurt (30 km um 63303)'), ('ppl_hvk_freiburg', 'HvK Freiburg (30 km um 79098)')) AS n(id, label)
WHERE s."airtableId" = 'recKik4hja6EKhkuy'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "SubscriptionArea" ("id", "subscriptionId", "label", "plzRanges", "quantity", "period", "createdAt", "updatedAt")
SELECT a.id, a.sub, a.label, a.plz, a.qty, 'month', now(), now()
FROM (VALUES
  ('area_hvk_frankfurt', 'ppl_hvk_frankfurt', 'Frankfurt (30 km um 63303)', '55276|55283|55294|55299|60311-61118|61137-61138|61184-61191|61348-61381|61440-61476|63065-63500|63512-63538|63755-63762|63791-63801|63811-63814|64283-64380|64390-64405|64409-64572|64584-64589|64665|64807-64859|65239|65428-65479|65719-65936', 40),
  ('area_hvk_freiburg', 'ppl_hvk_freiburg', 'Freiburg (30 km um 79098)', '77955|77975|77978|78120|78141|78148|79098-79395|79410|79423|79426-79427|79674-79677|79683-79685|79691-79697|79822|79856|79868|79872-79874', 15)
) AS a(id, sub, label, plz, qty)
WHERE EXISTS (SELECT 1 FROM "LeadSubscription" WHERE "id" = a.sub)
ON CONFLICT ("id") DO NOTHING;
