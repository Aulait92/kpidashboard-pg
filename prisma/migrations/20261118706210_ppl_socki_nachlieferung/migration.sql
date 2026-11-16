-- Lukas Socki (mein Novus Kassel), PKV-Tarifoptimierung: Nachlieferung der noch offenen 16 Leads
-- (Abgleich 14.09. bis 25.10., Ole 16.11.2026). Aktiv, live, einmalig ab jetzt mit Ziel 16: nach 16
-- Lieferungen ist Schluss (ein Monatsziel würde am 1.12. wieder bei 0 anfangen). Wiederholbar.
UPDATE "LeadSubscription"
SET "active" = true, "status" = 'live', "period" = 'once', "goal" = 16, "startDate" = now(), "updatedAt" = now()
WHERE "airtableId" = 'rec5v8fIt3ncrdATq' AND NOT ("active" = true AND "period" = 'once' AND "goal" = 16);
