-- Entscheidungs-Call abgeschaltet (Ole, 19.11.2026): Abgeschlossen wird im Beratungsgespräch, nicht in einem dritten Termin.
-- Nicht mehr online buchbar: Angebotsmail, Angebotsseite und Zahlungserinnerung enthalten keinen Buchungslink mehr
-- (entscheidungsCallStand → „keiner“). Schon gebuchte Entscheidungs-Calls bleiben bestehen und werden weiter genannt.
UPDATE "SalesBookingType" SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "slug" = 'entscheidung';
