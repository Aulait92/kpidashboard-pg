-- Neuigkeit: Nachricht an unser Team direkt aus der KI-Hilfe senden
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_hilfe_senden', 'Unser Team direkt aus der Hilfe erreichen',
 'In der **KI-Hilfe** tippen Sie auf **Mensch** bzw. **Mit Mensch sprechen**. Ihre Nachricht ist mit Ihrer Frage schon vorbereitet, Sie ergänzen sie bei Bedarf und tippen **Senden**, ohne Mailprogramm. Unsere Antwort kommt an Ihre E-Mail-Adresse.',
 'verbessert', 'alle', '2026-11-14 19:45:00', '2026-11-14 19:45:00', '2026-11-14 19:45:00')
ON CONFLICT ("id") DO NOTHING;
