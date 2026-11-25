-- Neuigkeit (25.11.2026, Usability-Check): Buchungsseite und Konto zeigen die Firma aus den Anbieterangaben statt des internen Kundennamens. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2511_firmenname_buchungsseite', 'Ihr Firmenname auf der Buchungsseite',
 'Ihre Buchungsseite und **Konto & Rechnungen** zeigen jetzt Ihre Firma aus den Anbieterangaben statt unserer internen Bezeichnung. Ändern können Sie den Namen unter **Einrichtung → Erstinformation für Ihre Leads**.',
 'behoben', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
