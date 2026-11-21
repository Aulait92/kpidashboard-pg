-- Neuigkeit korrigiert (21.11.2026, Ole): Festnetznummern bekommen wieder die WhatsApp (manche haben WhatsApp, z. B.
-- Firmen über Superchat). Erst wenn sie nicht ankommt, steht der Lead als Anruf auf „Heute“. Kein Push.
UPDATE "ProductUpdate" SET
  "title" = 'Leads mit Festnetznummer: WhatsApp oder Anruf',
  "body" = 'Hat ein neuer Lead nur eine Festnetznummer angegeben, schreibt der Assistent ihm trotzdem per WhatsApp, denn manche Festnetznummern haben WhatsApp. Kommt die Nachricht nicht an, steht der Lead sofort ganz oben auf **Heute** mit „Keine Handynummer: bitte anrufen“, den gleichen Hinweis sehen Sie im Kontakt.',
  "updatedAt" = '2026-11-21 09:00:00'
WHERE "id" = 'upd_2611_festnetz_anrufen';
