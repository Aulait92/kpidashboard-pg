-- Ole, 21.11.2026: Produktliste weiter bereinigen. Teilverkauf und Doppelungen ausblenden (active = false; vorhandene
-- Leads und Formulare behalten ihren Namen). Es bleiben „Katzenversicherung“ und „Kinderwunsch“.
UPDATE "Product" SET "active" = false
WHERE "active" = true AND "name" IN ('Immobilienbesitzer mit Teilverkauf-Interesse', 'Katzenversicherung (TKV)', 'Kinderwunsch-Interessenten');
