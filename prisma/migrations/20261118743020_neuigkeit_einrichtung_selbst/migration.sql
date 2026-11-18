-- Neuigkeit (18.11.2026): Einrichtung, Testlead selbst schicken, Logo bestätigen, Gesellschaften wählen. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_einrichtung_selbst', 'Einrichtung: Assistent selbst testen',
 'Unter **Einrichtung → Start** schicken Sie sich mit einem Klick einen Testlead aufs eigene Handy und erleben Ihren Assistenten wie ein Kunde. In der Einrichtung bestätigen Sie außerdem Ihr Logo für Präsentation und Angebot und wählen Ihre Gesellschaften, deren Tarife die Terminvorbereitung zuerst vorschlägt.',
 'neu', 'software', '2026-11-18 08:00:00', '2026-11-18 08:00:00', '2026-11-18 08:00:00')
ON CONFLICT ("id") DO NOTHING;
