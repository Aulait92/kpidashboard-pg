-- Neuigkeit (17.11.2026): Seite „Wachstum“ neu gestaltet (Rechnet sich das?, offene Chancen, Hebel der Woche). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_wachstum_neu', 'Wachstum: auf einen Blick, ob es sich rechnet',
 'Unter **Wachstum** sehen Sie oben in einem Satz, ob sich Ihre Leads schon rechnen, daneben die Rechnung aus Provision, Bestand Ihrer neuen Kunden und Kosten. Tippen Sie auf **Offene Chancen**, sehen Sie Ihre offenen Angebote, Termine und Bedenkzeiten mit dem nächsten Schritt je Kontakt, und darunter Ihre wichtigsten Hebel für diese Woche.',
 'verbessert', 'alle', '2026-11-17 20:30:00', '2026-11-17 20:30:00', '2026-11-17 20:30:00')
ON CONFLICT ("id") DO NOTHING;
