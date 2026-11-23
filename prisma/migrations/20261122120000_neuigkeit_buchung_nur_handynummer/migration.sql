-- Neuigkeit (22.11.2026): Wer nach dem Leadformular auf „Jetzt Termin buchen“ tippt, gibt auf der Buchungsseite nur noch
-- seine Handynummer ein; Name und E-Mail kommen aus der Anfrage. Andere Nummer: Termin hängt trotzdem an der Anfrage. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_buchung_nur_handynummer', 'Termin buchen direkt nach der Anfrage: nur noch die Handynummer',
 'Wer gerade Ihr Formular abgeschickt hat und auf „Jetzt Termin buchen“ tippt, wählt eine Uhrzeit und gibt nur noch seine Handynummer ein. Name und E-Mail übernimmt die App aus der Anfrage, der Termin steht wie gewohnt in Ihrem **Kalender** und beim Kontakt. Das gilt für alle neu angelegten Leadformulare.',
 'verbessert', 'software', '2026-11-22 12:00:00', '2026-11-22 12:00:00', '2026-11-22 12:00:00')
ON CONFLICT ("id") DO NOTHING;
