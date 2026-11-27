-- Bezüge der Vertriebspartner von Nico Yagci und Tobias D'Angelo auf Wochenbestellung (Ole, 27.11.2026: „stelle alle
-- auf Woche“). Ab jetzt bestellen und bezahlen die Hauptkunden je Woche unter /buyer/bestellen; offene Ersatzleads
-- (Nachlieferung) werden weiter zuerst geliefert.
UPDATE "LeadSubscription" SET "period" = 'week'
WHERE "id" IN ('cmwju3sxp0rnc5onvo11jdln7', 'cmwju3stz0rn05onv3louowbb', 'cmwju3suq0rn25onv4d8s6pen',
               'cmwju3sub0rn15onvqxhhm2qq', 'cmwju3sve0rn45onv4he0eq2f')
  AND "period" <> 'week';
