-- Neuigkeit (17.11.2026): Chat-Seite neu gestaltet (drei Absender, Ereigniszeilen, nächster Schritt, Angaben fürs Angebot). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_chat_neu', 'Nachrichten: übersichtlicher, mit dem nächsten Schritt',
 'Unter **Nachrichten** sehen Sie auf einen Blick, wer schreibt: Ihr Lead, Ihr Assistent oder Sie selbst; Termine und Übergaben stehen als kurze Zeile im Verlauf. Daneben (am Handy oben im Chat) steht der nächste Schritt mit einem Knopf, etwa **Vorbereitung öffnen** oder **Antworten**, darunter Termin, Anfrage und die Angaben fürs Angebot als übersichtliche Liste.',
 'verbessert', 'software', '2026-11-17 20:15:00', '2026-11-17 20:15:00', '2026-11-17 20:15:00')
ON CONFLICT ("id") DO NOTHING;
