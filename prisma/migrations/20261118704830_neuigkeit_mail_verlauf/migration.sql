-- Neuigkeit: alle E-Mails an Leads und Bestandskunden im Verlauf
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_mail_verlauf', 'Alle E-Mails im Verlauf',
 'Jede E-Mail an Ihre Leads und Bestandskunden steht jetzt im Verlauf des Kontakts, auch die automatischen wie Terminbestätigung, Terminerinnerung oder Kampagnen-Mails, jeweils mit Status (versendet, zugestellt, nicht zustellbar). So sehen Sie vor dem Anruf, was Ihr Kunde schon bekommen hat: **Lead öffnen → Notizen & Verlauf**, für Bestandskunden **Bestand → Kunden**.',
 'verbessert', 'software', '2026-11-15 22:45:00', '2026-11-15 22:45:00', '2026-11-15 22:45:00')
ON CONFLICT ("id") DO NOTHING;
