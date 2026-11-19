-- Neuigkeit (19.11.2026, UX-Runde Team D): Konto zeigt zuerst den Betrag, Rechnungen und Zahlung in einer Karte, E-Mail bei
-- neuen Leads unter Erinnerungen & Aufgaben, WhatsApp-Vorlagen oben im Assistenten, Team-Zahlen am Handy als Liste. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_zahlen_einstellungen', 'Konto, Einstellungen und Team-Zahlen übersichtlicher',
 'Unter **Einstellungen → Konto & Rechnungen** sehen Sie oben sofort, was Sie zahlen, Rechnungen und Zahlung stehen zusammen in einer Karte. Die E-Mail bei neuen Leads schalten Sie jetzt unter **Einstellungen → Erinnerungen & Aufgaben**, die WhatsApp-Vorlagen finden Sie oben unter **Einstellungen → Assistent**. Am Handy zeigt **Wachstum** Ihr Team als Liste je Person statt als breite Tabelle.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
