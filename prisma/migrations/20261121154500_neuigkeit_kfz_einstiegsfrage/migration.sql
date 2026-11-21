-- Neuigkeit (21.11.2026): Kfz-Leads bekommen in der ersten WhatsApp eine passende Einstiegsfrage mit Antwortknöpfen
-- statt der allgemeinen Frage nach einem Telefonat. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kfz_einstiegsfrage', 'Kfz-Leads: erste Nachricht mit passender Frage',
 'Ihre Kfz-Leads bekommen in der ersten WhatsApp jetzt eine Frage, die zu ihrem Anliegen passt und per Tipp beantwortet wird, zum Beispiel beim Wechsel: „Wann läuft Ihr jetziger Vertrag aus?“. Die Antwort sehen Sie im Chat unter **Angaben fürs Angebot**, danach schlägt der Assistent den Termin vor.',
 'verbessert', 'software', '2026-11-21 15:45:00', '2026-11-21 15:45:00', '2026-11-21 15:45:00')
ON CONFLICT ("id") DO NOTHING;
