-- Neuigkeit (22.11.2026, „Terminsuche über 7 Tage“): späterer Terminwunsch → Wiedervorlage des Assistenten; zweimal keine
-- Zeit passend → Buchungslink; Kalender voll → Aufgabe auf Heute. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_terminsuche_spaeter', 'Später Zeit? Ihr Assistent meldet sich dann wieder',
 'Möchte ein Lead erst in einigen Wochen einen Termin, zum Beispiel „im Dezember“, legt Ihr Assistent eine Wiedervorlage an und meldet sich zum Wunschtag mit passenden Zeiten. Passt zweimal keine Zeit, bekommt der Lead Ihren Buchungslink. Ist Ihr Kalender voll, sehen Sie eine Aufgabe auf **Heute** und melden sich persönlich.',
 'verbessert', 'software', '2026-11-22 10:00:00', '2026-11-22 10:00:00', '2026-11-22 10:00:00')
ON CONFLICT ("id") DO NOTHING;
