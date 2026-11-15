-- Neuigkeit: Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_rueckmeldung_meta', 'Meta lernt aus Ihren Ergebnissen',
 'Die App meldet jetzt automatisch an Meta zurück, welche Leads aus Ihren Meta-Formularen erreicht wurden, einen Termin hatten oder abgeschlossen haben, damit Meta lernt, welche Leads abschließen. Gesendet werden nur die Lead-ID von Meta, die Stufe, der Zeitpunkt und beim Abschluss der Beitrag, keine Kontaktdaten und kein Produkt. Je vollständiger Sie Abschlüsse mit Beitrag eintragen, desto besser lernt Meta; ein- und ausschalten können Sie das unter **Einstellungen → Rückmeldung an Meta**.',
 'neu', 'alle', '2026-11-15 12:00:00', '2026-11-15 12:00:00', '2026-11-15 12:00:00')
ON CONFLICT ("id") DO NOTHING;
