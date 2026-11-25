-- Neuigkeit (25.11.2026): „Ich habe keinen Online-Kalender“ für alle Gesellschaften. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_ohne_online_kalender', 'Termine auch ohne Online-Kalender',
 'Sie haben keinen Google- oder Outlook-Kalender, den Sie verbinden dürfen? Wählen Sie unter **Mein Kalender** (oder in der **Einrichtung**) „Ich habe keinen Online-Kalender“. Leads buchen dann in Ihren festen Beratungszeiten, jeder Termin kommt als Kalendereinladung per Mail, und eigene Termine blockieren Sie, indem Sie sie an Ihre persönliche Termin-Adresse weiterleiten.',
 'neu', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
