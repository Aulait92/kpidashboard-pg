-- Kollegen empfehlen (Ole, 15.11.2026): Prämie für den Empfehler jetzt 300 € netto Gutschrift je Empfehlung,
-- die Kunde wird (statt 3 Monate Bestandskunden-Modul gratis). Nur Daten, nur wenn noch der alte Standard
-- gespeichert ist; im Admin bleibt der Betrag änderbar, „bestand“ bleibt wählbar.
UPDATE "ReferralSettings"
SET "rewardKind" = 'fixed', "rewardFixed" = 300, "rewardMonths" = NULL, "updatedAt" = NOW()
WHERE "id" = 'default'
  AND "rewardKind" = 'bestand'
  AND COALESCE("rewardMonths", 3) = 3;

-- Login-Karte „Kollegen“ (ausgeschaltet): Text angleichen, nur wenn unverändert.
UPDATE "LoginCard"
SET "text" = 'Ihr Kollege spart 300 € bei der Einrichtung. Sie bekommen 300 € auf Ihre nächste Rechnung gutgeschrieben.', "updatedAt" = NOW()
WHERE "id" = 'login-karte-kollegen'
  AND "text" = 'Ihr Kollege spart 300 € bei der Einrichtung. Sie bekommen 3 Monate das Bestandskunden-Modul gratis.';
