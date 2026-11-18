-- Neuigkeit (18.11.2026): Policen vom Kunden nur mit Zwei-Faktor-Login, Einrichtung direkt an den Unterlagen. Kein Push.
-- Virenprüfung und Löschprotokoll sind Technik ohne eigene Neuigkeit.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_zwei_faktor_policen', 'Policen vom Kunden nur mit Zwei-Faktor-Login',
 'Policen, die Ihre Kunden per WhatsApp schicken, können Gesundheitsangaben enthalten. Deshalb öffnen Sie sie jetzt nur mit Zwei-Faktor-Login: Wer ihn noch nicht hat, tippt an den Unterlagen auf **Jetzt einrichten**, scannt den QR-Code mit einer Authenticator-App und sichert die Notfall-Codes, das dauert etwa eine Minute. Für alles andere bleibt er freiwillig unter **Einstellungen → Anmeldung & Sicherheit**.',
 'verbessert', 'software', '2026-11-18 03:40:00', '2026-11-18 03:40:00', '2026-11-18 03:40:00')
ON CONFLICT ("id") DO NOTHING;
