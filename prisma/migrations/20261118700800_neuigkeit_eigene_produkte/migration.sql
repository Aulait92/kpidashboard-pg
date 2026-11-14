-- Neuigkeit: Eigenes Produkt mit eigenen Provisionssätzen beim Abschluss
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_eigene_produkte', 'Eigene Produkte mit eigenen Provisionssätzen',
 'Beim Abschluss wählen Sie jetzt **Sonstiges (eigenes Produkt)**, tragen das Produkt ein, etwa Kfz Flotte oder Rechtsschutz Gewerbe, und Ihre Sätze für Abschluss und Bestand. Die geschätzte Provision sehen Sie sofort. Das Produkt steht beim nächsten Abschluss zur Auswahl und erscheint in Ihren Zahlen mit Namen. Bearbeiten unter **Einstellungen → Meine Provisionen**.',
 'neu', 'alle', '2026-11-14 19:20:00', '2026-11-14 19:20:00', '2026-11-14 19:20:00')
ON CONFLICT ("id") DO NOTHING;
