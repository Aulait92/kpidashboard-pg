-- Neuigkeit vom 14.11.: Bereichsname positiv („Vom Empfehlungslink zum Neukunden“ statt „Wo gehen Empfehlungen verloren?“)
UPDATE "ProductUpdate"
SET "body" = replace("body", '**Wo gehen Empfehlungen verloren?**', '**Vom Empfehlungslink zum Neukunden**'),
    "updatedAt" = now()
WHERE "id" = 'upd_2611_empfehlung_playbook' AND "body" LIKE '%Wo gehen Empfehlungen verloren?%';
