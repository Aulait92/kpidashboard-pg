-- Neuigkeit (21.11.2026): Leads mit eindeutig falscher Telefonnummer (z. B. „23456789“) setzt die App selbst auf
-- „Verloren: falsche Daten“, ohne Push und ohne WhatsApp. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_falsche_nummern', 'Leads mit falscher Nummer sortiert die App selbst aus',
 'Trägt jemand eine erkennbar erfundene Telefonnummer ein, etwa eine Zahlenreihe wie 23456789, setzt die App den Lead selbst auf **Verloren: falsche oder ungültige Daten**. Sie bekommen dafür keine Mitteilung mehr und müssen nicht anrufen. Im Kontakt sehen Sie den Grund im Verlauf.',
 'verbessert', 'software', '2026-11-21 21:30:00', '2026-11-21 21:30:00', '2026-11-21 21:30:00')
ON CONFLICT ("id") DO NOTHING;
