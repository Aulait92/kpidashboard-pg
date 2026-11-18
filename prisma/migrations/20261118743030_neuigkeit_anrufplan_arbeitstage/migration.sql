-- Neuigkeit (18.11.2026): Anrufversuche nur an Arbeitstagen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_anrufplan_arbeitstage', 'Anrufversuche nur an Ihren Arbeitstagen',
 'Ihr Anrufplan legt Versuche nur noch auf Ihre Arbeitstage, standardmäßig Montag bis Freitag. Bieten Sie samstags Termine an (**Kalender → Freie Zeiten**), plant die App auch samstags.',
 'verbessert', 'software', '2026-11-18 09:00:00', '2026-11-18 09:00:00', '2026-11-18 09:00:00')
ON CONFLICT ("id") DO NOTHING;
