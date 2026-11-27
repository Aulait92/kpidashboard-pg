-- Bestellkonto Nico Yagci wieder anlegen und Vertriebspartner zuordnen (Ole, 27.11.2026). Das Konto aus
-- 20261122190000_bestellkonto fehlte in der Produktion (vermutlich gelöscht, damit war auch Dennis Müller nicht mehr
-- zugeordnet). Partner laut Ole: Nico Yagci → Florian Bausch, Dennis Müller, Mikael; Tobias D'Angelo → Lukas Socki,
-- Daniel Seidel. Bezüge (Monat/Einmal → Wochenbestellung) bleiben unverändert, das stellt Ole im Admin um, sobald der
-- Hauptkunde eine Zahlungsart hinterlegt hat (docs/pay-per-lead.md, Livegang je Hauptkunde).

INSERT INTO "Customer" ("id", "name", "vermittlerRegisterNr")
VALUES ('bestellkonto_nico_yagci', 'Nico Yagci', 'D-C9FQ-V848D-75')
ON CONFLICT DO NOTHING;

-- Login: blieb beim Löschen ggf. ohne Kunde bestehen (onDelete SetNull), dann wieder zuordnen, sonst neu anlegen
-- (Passwort unbekannter Zufallswert, Ole schickt den Zugangslink selbst).
UPDATE "User" SET "customerId" = 'bestellkonto_nico_yagci', "teamRole" = 'owner'
WHERE "id" = 'login_bestellkonto_nico' AND "customerId" IS NULL;
INSERT INTO "User" ("id", "email", "passwordHash", "role", "customerId", "teamRole")
SELECT 'login_bestellkonto_nico', 'n.yagci@mein-novus.de', '$2b$12$zRECiSYX5v1l7WbrJx2cteZin8gyGE8kxImlLO8IT73QfFBvo8Su2', 'BUYER', 'bestellkonto_nico_yagci', 'owner'
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE "id" = 'login_bestellkonto_nico' OR lower("email") = 'n.yagci@mein-novus.de')
ON CONFLICT DO NOTHING;

-- Partner zuordnen (keine Ketten: Hauptkunden bestellen selbst nicht über jemanden)
UPDATE "Customer" SET "bestelltUeberId" = 'bestellkonto_nico_yagci'
WHERE "id" IN ('cmrorjboje89b1mp3n8s9pcww', 'cmuv436qmidrp2imrc21lcemv', 'cmsd7o2qr00111mozja8a14tb')
  AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'bestellkonto_nico_yagci' AND "bestelltUeberId" IS NULL);
UPDATE "Customer" SET "bestelltUeberId" = 'bestellkonto_tobias_dangelo'
WHERE "id" IN ('cmsd7o2pa000q1moz708v9jjp', 'cmvf9gswuiqy62imr04o27rrp')
  AND EXISTS (SELECT 1 FROM "Customer" WHERE "id" = 'bestellkonto_tobias_dangelo' AND "bestelltUeberId" IS NULL);

-- Umsatzsteuer (Ole, 27.11.2026): Nico Yagci und Tobias D'Angelo sind Versicherungsmakler nach § 34d GewO, Leads an sie
-- sind steuerfrei (§ 4 Nr. 11 UStG). Registerprüfung wie im Admin (Bezug → Steuer), Quelle: Ole.
UPDATE "Customer" SET "vermittlerRegisterStatus" = 'makler', "vermittlerGeprueftAt" = NOW(), "vermittlerGeprueftVon" = 'Ole (27.11.2026)'
WHERE "id" IN ('bestellkonto_nico_yagci', 'bestellkonto_tobias_dangelo') AND "vermittlerRegisterNr" IS NOT NULL;

-- Stornos werden nachgeliefert, nicht verrechnet (Ole, 27.11.2026), für alle Bezüge der Partner beider Hauptkunden.
-- Offene Gutschriften (noch nicht verrechnet) werden zu Ersatzleads; der Umsatz des reklamierten Leads bleibt wie bei
-- der Nachlieferung bestehen (lib/ppl/storno.ts approveErsatz). Nur volle Gutschriften (Umsatz storniert) umstellen.
WITH partner_bezug AS (
  SELECT s."id" FROM "LeadSubscription" s
  WHERE s."customerId" IN ('cmrorjboje89b1mp3n8s9pcww', 'cmuv436qmidrp2imrc21lcemv', 'cmsd7o2qr00111mozja8a14tb',
                           'cmsd7o2pa000q1moz708v9jjp', 'cmvf9gswuiqy62imr04o27rrp')
), offen AS (
  SELECT l."id" FROM "Lead" l
  WHERE l."subscriptionId" IN (SELECT "id" FROM partner_bezug)
    AND l."stornoState" = 'approved' AND l."creditedAt" IS NULL AND l."creditAmount" > 0
    AND NOT EXISTS (SELECT 1 FROM "Revenue" r WHERE r."leadId" = l."id" AND r."cancelled" = false)
), umsatz AS (
  UPDATE "Revenue" SET "cancelled" = false WHERE "leadId" IN (SELECT "id" FROM offen) AND "cancelled" = true RETURNING 1
)
UPDATE "Lead" SET "ersatzGeschuldet" = true, "creditAmount" = NULL WHERE "id" IN (SELECT "id" FROM offen);

UPDATE "LeadSubscription" SET "stornoErsatz" = true
WHERE "customerId" IN ('cmrorjboje89b1mp3n8s9pcww', 'cmuv436qmidrp2imrc21lcemv', 'cmsd7o2qr00111mozja8a14tb',
                       'cmsd7o2pa000q1moz708v9jjp', 'cmvf9gswuiqy62imr04o27rrp');
