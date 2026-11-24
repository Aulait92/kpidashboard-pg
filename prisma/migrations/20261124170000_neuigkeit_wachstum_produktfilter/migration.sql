-- Neuigkeit: Produktfilter auf „Wachstum“ (Ole, 24.11.2026; src/app/buyer/zahlen/page.tsx). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_wachstum_produkt', 'Wachstum je Produkt ansehen',
 'Unter **Zahlen** wählen Sie neben dem Zeitraum jetzt auch ein Produkt, zum Beispiel nur Kfz. Leads, Termine, Abschlüsse, Provision und offene Chancen zeigen dann nur dieses Produkt; Werbebudget und Betreuung werden anteilig nach Leads verteilt.',
 'neu', 'alle', '2026-11-24 17:00:00', '2026-11-24 17:00:00', '2026-11-24 17:00:00')
ON CONFLICT ("id") DO NOTHING;
