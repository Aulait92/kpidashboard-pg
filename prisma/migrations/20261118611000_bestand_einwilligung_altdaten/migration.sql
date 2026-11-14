-- Altdaten (Ole, 14.11.2026): Bis heute setzte jeder Import consentAt pauschal für alle Kunden, mit dem
-- Pflicht-Häkchen „Für diese Kunden liegt die Einwilligung zur Kontaktaufnahme per WhatsApp/E-Mail vor
-- (laut Versicherer)“. Diese Bestätigung des Vermittlers wird als Einwilligung für beide Kanäle gewertet,
-- Quelle „versicherer_pauschal“ (Datum = Importdatum). Die Oberfläche bittet den Vermittler, das zu prüfen
-- (Bestand → Einwilligungen & Versand), und bietet „auf unbekannt setzen“ an.
-- Nicht betroffen: Kunden, die aus einem Abschluss in der App übernommen wurden („Kunde mit Abschluss aus
-- der App“). Deren Formular-Einwilligung gilt der Anfrage, nicht der Werbung: beide Kanäle bleiben unbekannt
-- (E-Mail dann nur nach § 7 Abs. 3 UWG, WhatsApp gar nicht). Nur neue Spalten werden gefüllt.
UPDATE "ExistingCustomer"
SET "whatsappConsent" = 'ja',
    "whatsappConsentAt" = "consentAt",
    "whatsappConsentSource" = 'versicherer_pauschal',
    "emailConsent" = 'ja',
    "emailConsentAt" = "consentAt",
    "emailConsentSource" = 'versicherer_pauschal'
WHERE "consentAt" IS NOT NULL
  AND "consentNote" LIKE 'Einwilligung laut Versicherer%'
  AND "whatsappConsent" IS NULL
  AND "emailConsent" IS NULL;
