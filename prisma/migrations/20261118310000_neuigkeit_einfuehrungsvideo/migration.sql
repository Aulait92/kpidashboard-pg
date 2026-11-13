-- Neuigkeit: Einführungsvideos
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einfuehrungsvideo', 'Einführungsvideos: Ihre Software in 1 Minute',
 'Unter **Profil → Einführung ansehen** finden Sie jetzt einen kurzen Rundgang durch die App (ca. 1 Minute) und eine ausführliche Einführung (ca. 3 Minuten). Beide funktionieren auch ohne Ton.',
 'neu', 'software', '2026-11-14 00:02:00', '2026-11-14 00:02:00', '2026-11-14 00:02:00')
ON CONFLICT ("id") DO NOTHING;
