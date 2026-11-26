-- Neuigkeit (26.11.2026, Postfach mit Google oder Microsoft verbinden, Hinweis zum Videolink). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_postfach_google_microsoft', 'Postfach mit Gmail oder Outlook verbinden',
 'Ihr E-Mail-Postfach verbinden Sie jetzt mit einem Klick über Google (Gmail) oder Microsoft (Outlook/365): **Einstellungen → E-Mail-Postfach**. Braucht Ihr Firmenkonto eine Freigabe, finden Sie dort den Link für Ihre IT.

Mit Outlook entsteht für jeden Videotermin automatisch ein Teams-Link. Klappt das ohne Teams-Lizenz nicht, sagt Ihnen die App Bescheid, dann tragen Sie im Kalender Ihren eigenen Videolink ein.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
