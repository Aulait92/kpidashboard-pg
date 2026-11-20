-- Neuigkeit (20.11.2026): Meta-Freigabe in der Einrichtung zeigt „angekommen“ statt Fehler; Hilfe, wenn die E-Mail von 360dialog fehlt. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung_meta_whatsapp', 'Einrichtung: Meta-Freigabe und WhatsApp leichter',
 'Haben Sie Werbekonto und Seite für uns freigegeben, sehen Sie unter **Einrichtung → Meta freigeben** jetzt „Ihre Freigabe ist bei uns angekommen“, statt einer Fehlermeldung. Kommt die E-Mail von 360dialog zum Passwort nicht an, hilft **Einrichtung → WhatsApp verbinden → Keine E-Mail bekommen?** mit einer neuen E-Mail.',
 'behoben', 'software', '2026-11-20 11:55:00', '2026-11-20 11:55:00', '2026-11-20 11:55:00')
ON CONFLICT ("id") DO NOTHING;
