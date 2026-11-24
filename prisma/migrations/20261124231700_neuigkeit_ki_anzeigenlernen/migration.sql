-- Neuigkeit (Ole, 24.11.2026): neuer Unterauftragsverarbeiter (Amazon Web Services, Bedrock Frankfurt) und gemeinsames
-- Anzeigenlernen; der ganze Text mit Widerspruch steht unter Einstellungen (lib/datennutzung.ts). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_ki_anzeigenlernen', 'KI-Hilfe und gemeinsames Anzeigenlernen',
 'Für Gesprächszusammenfassungen und das Auslesen von Unterlagen nutzen wir zusätzlich Amazon Web Services EMEA SARL, Rechenzentrum Frankfurt. Ihre Anzeigen nutzen außerdem Muster und Ergebnisse aller Kunden und umgekehrt, ohne Namen, Personenfotos, Logos oder Zahlen einzelner Kunden. Den ganzen Text und die Möglichkeit zum Widerspruch finden Sie als Inhaber unter **Einstellungen → KI-Hilfe und Anzeigenlernen**.',
 'neu', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
