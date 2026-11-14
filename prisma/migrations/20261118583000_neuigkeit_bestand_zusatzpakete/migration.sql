-- Neuigkeit: Zusatzpakete für Kampagnen-Nachrichten im Bestandskunden-Modul
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_bestand_zusatzpakete', 'Mehr Kampagnen-Nachrichten mit Zusatzpaketen',
 'Unter **Bestand** sehen Sie oben, wie viele Kampagnen-Nachrichten diesen Monat noch frei sind. Reicht das nicht, buchen Sie mit **Paket dazubuchen** 500 Nachrichten für 99 € oder 2.000 für 349 € (netto, einmalig, 3 Monate gültig), sofort freigeschaltet. Ist das Kontingent aufgebraucht, pausiert eine laufende Kampagne mit Hinweis und läuft nach dem Dazubuchen weiter; auf Wunsch bucht die App bis zu einem Höchstbetrag automatisch nach.',
 'neu', 'software', '2026-11-14 12:59:00', '2026-11-14 12:59:00', '2026-11-14 12:59:00')
ON CONFLICT ("id") DO NOTHING;
