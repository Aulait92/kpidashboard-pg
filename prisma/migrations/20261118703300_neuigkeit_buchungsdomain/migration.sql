-- Neuigkeit: Seiten für Kunden der Vermittler unter eigener, neutraler Adresse (dein-beratungstermin.de)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_buchungsdomain', 'Neutrale Adresse für Ihre Buchungsseite',
 'Ihre Buchungsseite und alle Seiten, die Ihre Kunden öffnen (Termin verschieben, Empfehlung, Einwilligung, Abmelden, Erstinformation), laufen jetzt unter der neutralen Adresse dein-beratungstermin.de, unten stehen Ihr Impressum und Ihre Datenschutzerklärung. Ihren neuen, kürzeren Buchungslink finden Sie unter **Mein Kalender → Ihre Buchungsseite**. Bereits verschickte Links funktionieren weiter und führen automatisch zur neuen Adresse.',
 'neu', 'alle', '2026-11-15 18:00:00', '2026-11-15 18:00:00', '2026-11-15 18:00:00')
ON CONFLICT ("id") DO NOTHING;
