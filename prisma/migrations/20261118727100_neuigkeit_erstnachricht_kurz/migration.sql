-- Neuigkeit (17.11.2026): erste WhatsApp kürzer, genau eine Frage vor dem Terminvorschlag, Vermittler als „Herr/Frau Nachname“. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_erstnachricht_kurz', 'Erste WhatsApp an neue Leads kürzer',
 'Die erste WhatsApp an neue Leads ist jetzt kurz und passt ohne Aufklappen auf den Bildschirm. Bei Privatschutz stellt Ihr Assistent danach genau eine Frage mit Antwortknöpfen und schlägt dann gleich zwei Termine vor, passend zur Antwort. Im Chat nennt er Sie beim Siezen „Herr“ bzw. „Frau“ mit Nachnamen; Ihre Anrede wählen Sie unter **Einrichtung → Erstinformation**.',
 'verbessert', 'software', '2026-11-17 22:45:00', '2026-11-17 22:45:00', '2026-11-17 22:45:00')
ON CONFLICT ("id") DO NOTHING;
