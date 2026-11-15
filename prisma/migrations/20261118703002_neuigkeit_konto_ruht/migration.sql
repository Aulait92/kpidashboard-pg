-- Neuigkeit: Konto ruht nach Vertragsende, Daten 24 Monate aufbewahrt, frühere Löschung wählbar, Reaktivierung (Ole, 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_konto_ruht', 'Nach einer Kündigung: Ihre Daten bleiben 24 Monate für Sie da',
 'Endet Ihr Vertrag, ruht Ihr Konto: Wir bewahren Ihre Daten 24 Monate auf, damit Sie jederzeit zurückkommen können, und mit **Konto reaktivieren** ist alles wieder da. Eine frühere Löschung (nach 3 Monaten oder sofort) wählen Sie bei der Kündigung oder später unter **Konto & Rechnungen → Ihr Vertrag**. Herunterladen können Sie Ihre Daten bis zur Löschung jederzeit.',
 'verbessert', 'alle', '2026-11-15 17:00:00', '2026-11-15 17:00:00', '2026-11-15 17:00:00')
ON CONFLICT ("id") DO NOTHING;
