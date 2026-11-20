-- Neuigkeit (19.11.2026): Policen-Hinweis in der Terminerinnerung am Vortag, auch ohne Häkchen bei der Buchung. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_policen_vortag', 'Mehr Policen vor dem Termin',
 'Hat Ihr Kontakt seine Policen noch nicht geschickt, erinnert ihn die Terminerinnerung am Vortag jetzt mit einem kurzen Satz daran, freiwillig und ohne Druck. So gehen Sie öfter vorbereitet ins Gespräch. Eingegangene Policen sehen Sie wie gewohnt in der **Terminvorbereitung**.',
 'verbessert', 'software', '2026-11-19 22:30:00', '2026-11-19 22:30:00', '2026-11-19 22:30:00')
ON CONFLICT ("id") DO NOTHING;
