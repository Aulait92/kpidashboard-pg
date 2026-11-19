-- Login-Karte „Sparte“: Preis klar nennen statt „Einrichtung kostenlos“ (Ole, 19.11.2026: wirkte wie gratis).
-- {preisSparte} wird beim Anzeigen aus PRICE_LIST.extraProductMonthly ersetzt (components/login-info-card.tsx).
-- Nur ändern, wenn der Text noch der ursprüngliche ist (von Hand gepflegte Texte bleiben).
UPDATE "LoginCard"
SET "text" = 'Privatschutz, Hund, Pferd und mehr: {preisSparte} im Monat je Sparte (netto), ohne Einrichtungsgebühr. Neue Leads in wenigen Tagen.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'login-karte-sparte'
  AND "text" = 'Privatschutz, Hund, Pferd und mehr: Einrichtung kostenlos, neue Leads in wenigen Tagen.';
