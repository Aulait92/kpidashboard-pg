-- Neuigkeiten: mehrere Verträge pro Kunde (Cross-Selling) und neue Zahlen (Abschluss- und Bestandsprovision, Gewinn mit Betreuung)
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_cross_selling', 'Mehrere Verträge pro Kunde eintragen',
 'Schließt ein Kunde noch etwas ab, z. B. eine Haftpflicht zum Tierschutz, tragen Sie es im Kontakt unter **Verträge → Weiteren Abschluss eintragen** ein, mit Sparte, Beitrag und Police. Jeder Vertrag rechnet mit dem Satz seiner Sparte (änderbar unter **Meine Provisionen**). 3 Wochen nach dem Abschluss erinnert Sie die App auf **Heute** an ein weiteres Angebot.',
 'neu', 'software', '2026-11-14 12:46:00', '2026-11-14 12:46:00', '2026-11-14 12:46:00'),
('upd_2611_zahlen_bestand_gewinn', 'Zahlen: Bestandsprovision und ehrlicher Gewinn',
 'Unter **Zahlen → Kosten & Ertrag** sehen Sie jetzt getrennt die einmalige Abschlussprovision und Ihre laufende Bestandsprovision, inklusive Ausblick auf 5 Jahre. Der Gewinn zieht neben den Lead-Kosten auch die Betreuung ab, Abschlüsse aus Empfehlungen zählen voll mit. Die Quoten rechnen nur mit bezahlten Leads.',
 'verbessert', 'alle', '2026-11-14 12:46:00', '2026-11-14 12:46:00', '2026-11-14 12:46:00')
ON CONFLICT ("id") DO NOTHING;
