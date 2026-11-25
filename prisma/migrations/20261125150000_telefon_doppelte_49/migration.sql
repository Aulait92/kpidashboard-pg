-- Ländervorwahl doppelt (Ole, 25.11.2026, Lead „+49 491791410364“): Der Lead hat „49“ vor seine Handynummer getippt,
-- das Formular setzte +49 davor. Gespeicherte Nummern bereinigen, wenn nach 4949 eine vollständige deutsche Handynummer
-- folgt (wie normalizePhone/ohneDoppelte49 in lib/whatsapp/phone.ts). „+“ bleibt erhalten, Trigger pflegen phoneDigits.

UPDATE "Lead" SET "phone" = (CASE WHEN "phone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("phone", '\D', '', 'g') from 5)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

UPDATE "SalesContact" SET "phone" = (CASE WHEN "phone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("phone", '\D', '', 'g') from 5)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

UPDATE "SalesInboundLead" SET "phone" = (CASE WHEN "phone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("phone", '\D', '', 'g') from 5)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

UPDATE "ExistingCustomer" SET "phone" = (CASE WHEN "phone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("phone", '\D', '', 'g') from 5)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

UPDATE "PoolLead" SET "phone" = (CASE WHEN "phone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("phone", '\D', '', 'g') from 5)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

UPDATE "Deal" SET "phone" = (CASE WHEN "phone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("phone", '\D', '', 'g') from 5)
WHERE regexp_replace("phone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

UPDATE "SalesMeeting" SET "inviteePhone" = (CASE WHEN "inviteePhone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace("inviteePhone", '\D', '', 'g') from 5)
WHERE regexp_replace("inviteePhone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$';

-- Chats: nur, wenn es mit der richtigen Nummer noch keinen Chat gibt (eindeutig je Kunde und Nummer)
UPDATE "Conversation" c SET "contactPhone" = (CASE WHEN c."contactPhone" LIKE '+%' THEN '+' ELSE '' END) || '49' || substring(regexp_replace(c."contactPhone", '\D', '', 'g') from 5)
WHERE regexp_replace(c."contactPhone", '\D', '', 'g') ~ '^4949(1[5-7][0-9]{8,9})$'
  AND NOT EXISTS (
    SELECT 1 FROM "Conversation" o
    WHERE o."customerId" = c."customerId"
      AND regexp_replace(o."contactPhone", '\D', '', 'g') = '49' || substring(regexp_replace(c."contactPhone", '\D', '', 'g') from 5)
  );
