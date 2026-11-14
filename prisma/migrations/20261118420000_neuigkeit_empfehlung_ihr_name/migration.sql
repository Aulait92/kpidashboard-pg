-- Neuigkeit: Empfehlungs- und Terminseiten in Ihrem Namen, größere Schrift in den Einstellungen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_empfehlung_ihr_name', 'Empfehlungsseiten in Ihrem Namen und besser lesbare Einstellungen',
 'Die Seiten, die Ihre Kunden und deren Bekannte beim Empfehlen und bei der Terminbuchung sehen, zeigen jetzt nur noch Ihren Namen, nicht mehr unser Logo. Als Standard-Angebot für Empfohlene ist der **kostenlose Versicherungs-Check** voreingestellt; ändern können Sie das unter **Empfehlungen & Bewertungen → Einstellungen**. Außerdem sind Hinweistexte in den Einstellungen größer und besser lesbar.',
 'verbessert', 'alle', '2026-11-14 08:30:00', '2026-11-14 08:30:00', '2026-11-14 08:30:00')
ON CONFLICT ("id") DO NOTHING;
