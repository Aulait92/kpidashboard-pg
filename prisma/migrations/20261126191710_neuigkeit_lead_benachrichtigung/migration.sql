-- Neuigkeit (26.11.2026, Teams: neue Leads per E-Mail und Push, „nur meine“ oder „alle im Team“). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_lead_benachrichtigung_team', 'Neue Leads im Team: Sie entscheiden, was Sie mitbekommen',
 'Arbeiten Sie im Team, wählt jetzt jede Person selbst, ob sie bei neuen Leads per E-Mail und Push nur über eigene oder über alle Leads im Team informiert wird: **Einstellungen → Erinnerungen & Aufgaben → Neue Leads**. Als Inhaber erfahren Sie so von jedem neuen Lead, auch wenn er an Ihr Team geht.',
 'neu', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
