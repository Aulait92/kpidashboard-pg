-- Neuigkeit: Erinnerung 7 Tage vor Ende jeder Testphase bzw. Gratiszeit, mit Knopf „Beenden“
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_testphasen', 'Testphasen: rechtzeitig erinnert, jederzeit kostenlos beendbar',
 'Endet eine Testphase oder eine Gratiszeit (zum Beispiel ein Zusatzmodul als Dankeschön für eine Empfehlung), erinnern wir Sie 7 Tage vorher per E-Mail und mit einem Hinweis auf Ihrer Startseite. Mit **Beenden** gelangen Sie direkt zu **Konto & Rechnungen**, dort beenden Sie das Modul bis zum letzten Tag ohne Kosten.',
 'verbessert', 'alle', '2026-11-14 17:30:00', '2026-11-14 17:30:00', '2026-11-14 17:30:00')
ON CONFLICT ("id") DO NOTHING;
