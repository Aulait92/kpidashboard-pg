-- Neuigkeit (26.11.2026, Produktfilter in den Kontakten, nur bei mindestens zwei Produkten). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kontakte_produktfilter', 'Kontakte nach Produkt filtern',
 'Betreuen Sie mehrere Produkte, zeigen Sie mit einem Tipp nur die Kontakte eines Produkts, in der Liste und in der Pipeline: **Kontakte → Produkt**. Die Zahlen an „Zu erledigen“, „Alle“, „Neu“ und „Termin“ passen sich an.',
 'neu', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
