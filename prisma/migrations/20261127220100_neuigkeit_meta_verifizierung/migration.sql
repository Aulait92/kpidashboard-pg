-- Neuigkeit (27.11.2026, Hinweis zur Unternehmensverifizierung bei Meta für das Policen-Formular). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2711_meta_verifizierung', 'Policen per Formular: Hinweis zur Verifizierung bei Meta',
 'Schicken Ihre Kunden Policen bisher nur als Foto, fehlt meist die Unternehmensverifizierung bei Meta. Die App zeigt das jetzt auf **Heute** und unter **Einrichtung → WhatsApp verbinden**, mit Link zu Meta und kurzer Anleitung.',
 'verbessert', 'software', '2026-11-27 20:00:00', now(), now())
ON CONFLICT ("id") DO NOTHING;
