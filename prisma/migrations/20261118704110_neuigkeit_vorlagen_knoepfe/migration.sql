-- Neuigkeit: WhatsApp-Nachrichten mit Knöpfen, erste Frage je Produkt, verkaufsstärkere E-Mail-Vorlagen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "pushedAt", "createdAt", "updatedAt") VALUES
('upd_2611_vorlagen_knoepfe', 'Nachrichten mit Knöpfen und persönlichere E-Mails',
 'Ihr Assistent stellt in der ersten WhatsApp direkt eine leichte Frage zum Produkt, mit Knöpfen zum Antippen, und schickt Ihre Erstinformation als PDF gleich mit. Auch Erinnerungen und Nachfassen haben jetzt Knöpfe wie „Ja, passt“ oder „Bitte verschieben“, mit verbundenem Kalender auch zwei konkrete Terminvorschläge. Die E-Mail-Vorlagen unter **Einstellungen → E-Mail-Postfach** nennen Namen und Produkt im Betreff, das Angebot enthält drei Vorteile und einen festen nächsten Schritt.',
 'verbessert', 'software', '2026-11-15 19:00:00', NULL, '2026-11-15 19:00:00', '2026-11-15 19:00:00')
ON CONFLICT ("id") DO NOTHING;
