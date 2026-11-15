-- Neuigkeit: „Modul anfragen“ zeigt Konditionen, Kontingent und Zusatzpakete
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_modul_anfrage', 'Bestandskunden-Modul: alle Konditionen vor der Anfrage',
 'Unter **Konto & Rechnungen** und **Bestandskunden** sehen Sie vor dem Anfragen oder Buchen jetzt Preis, Laufzeit und Kündigung, das monatliche Kontingent (500 WhatsApp-Nachrichten und 2.000 E-Mails) und die Zusatzpakete für mehr Nachrichten. Bei der Anfrage geben Sie an, wie viele Nachrichten Sie ungefähr planen.',
 'verbessert', 'software', '2026-11-15 10:10:00', '2026-11-15 10:10:00', '2026-11-15 10:10:00')
ON CONFLICT ("id") DO NOTHING;
