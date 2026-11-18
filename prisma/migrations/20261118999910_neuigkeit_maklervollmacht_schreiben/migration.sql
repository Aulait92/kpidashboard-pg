-- Neuigkeit (18.11.2026): Maklervollmacht, Karte im Kontakt nach der Unterschrift als klare Aufgabe (alle Schreiben an
-- die Versicherer in einer Datei, je Versicherer abhaken), Versandstatus der Kopie, Schreiben mit passender Anrede. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_maklervollmacht_schreiben', 'Maklervollmacht: Schreiben an die Versicherer abhaken',
 'Nach der Unterschrift zeigt die Karte **Maklervollmacht** im Kontakt, wie viele Verträge noch nicht übertragen sind. Mit **Schreiben an Versicherer herunterladen** erhalten Sie alle offenen Schreiben in einer Datei und haken danach je Versicherer ab, was gesendet ist. Sie sehen außerdem, ob die Kopie per E-Mail an Ihren Kunden gesendet wurde.',
 'verbessert', 'alle', '2026-11-18 21:45:00', '2026-11-18 21:45:00', '2026-11-18 21:45:00')
ON CONFLICT ("id") DO NOTHING;
