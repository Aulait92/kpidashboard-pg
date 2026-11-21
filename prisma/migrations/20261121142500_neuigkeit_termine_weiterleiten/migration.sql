-- Neuigkeit (21.11.2026, Ole): Termine aus Outlook per Weiterleitung blockieren (App-Kalender ohne Google/Outlook-
-- Verbindung, lib/calendar/termin-weiterleitung.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termine_weiterleiten', 'Outlook-Termine per Weiterleitung blockieren',
 'Ist Ihr Firmenkalender gesperrt, leiten Sie eine Outlook-Einladung einfach an Ihre persönliche Adresse weiter, dann bieten wir in dieser Zeit keine Lead-Termine an. Änderungen und Absagen leiten Sie genauso weiter. Die Adresse finden Sie unter **Einstellungen → Mein Kalender → Ausnahmen: Zeit blockieren**.',
 'neu', 'software', '2026-11-21 14:25:00', '2026-11-21 14:25:00', '2026-11-21 14:25:00')
ON CONFLICT ("id") DO NOTHING;
