-- Vertreter/Makler aus dem angenommenen Angebot übernehmen (bisher blieb jeder Kunde "vertreter")
UPDATE "Customer" c
SET "vermittlerTyp" = 'makler'
FROM "Onboarding" o
JOIN "Offer" f ON f."id" = o."offerId"
WHERE o."customerId" = c."id" AND f."vermittlerTyp" = 'makler' AND c."vermittlerTyp" <> 'makler';
