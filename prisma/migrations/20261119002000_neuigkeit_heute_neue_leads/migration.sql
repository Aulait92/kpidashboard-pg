-- Neuigkeit (19.11.2026, UX-Runde Team A „Einstieg und Heute“): neue Leads ganz oben auf Heute, Einrichtung kürzer. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_heute_neue_leads', 'Neue Leads ganz oben auf Heute',
 'Neue Leads, die Sie selbst anrufen sollten, stehen auf **Heute** jetzt in einer eigenen Karte ganz oben, mit der Zeit seit Eingang (z. B. „vor 4 Min.“). In der **Einrichtung** ist der nächste Schritt aufgeklappt und markiert, und **Kollegen empfehlen** finden Sie jetzt direkt im Profilmenü.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
