-- Neuigkeit: Rechtsvorprüfung 16.11.2026 (Ole). Angebote mit Gesundheitsangaben werden nicht ausgelesen
-- (lib/angebote.ts); Makler: Hinweis auf die Marktauswahl in der Präsentation (lib/praesentation.ts); fehlendes
-- Impressum in der Einrichtung nachtragen (lib/impressum-fehlt.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_rechtliches', 'Angebote, Präsentation und Impressum: klarere Hinweise',
 'In der **Terminvorbereitung** liest die App nur Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierangebote aus; Angebote mit Gesundheitsangaben, etwa Zahnzusatz oder Berufsunfähigkeit, tragen Sie von Hand ein. Als Makler sehen Sie auf Empfehlung und Vergleich unten einen dezenten Hinweis, von welchen Gesellschaften die verglichenen Tarife stammen; den Text ändern Sie unter **Einstellungen → Präsentation**. Fehlt Ihr Impressum, tragen Sie die Adresse unter **Einrichtung → Erstinformation** ein, bis dahin verlinken Ihre Seiten für Kunden die Erstinformation.',
 'verbessert', 'software', '2026-11-16 19:00:00', '2026-11-16 19:00:00', '2026-11-16 19:00:00')
ON CONFLICT ("id") DO NOTHING;
