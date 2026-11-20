-- Neuigkeit (20.11.2026): Leads mit Festnetznummer bekommen keine WhatsApp mehr, sondern stehen sofort als Anruf auf „Heute“. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_festnetz_anrufen', 'Leads mit Festnetznummer: sofort anrufen',
 'Hat ein neuer Lead nur eine Festnetznummer angegeben, schreibt der Assistent ihm keine WhatsApp, denn dort käme sie nicht an. Stattdessen steht der Lead ganz oben auf **Heute** mit „Keine Handynummer: bitte anrufen“, den gleichen Hinweis sehen Sie im Kontakt.',
 'verbessert', 'software', '2026-11-20 08:45:00', '2026-11-20 08:45:00', '2026-11-20 08:45:00')
ON CONFLICT ("id") DO NOTHING;
