-- Neuigkeit „Wachstum je Produkt“ präzisiert (Ole, 24.11.2026): Werbebudget kommt aus den Kampagnen des Produkts.
UPDATE "ProductUpdate" SET "body" = 'Unter **Zahlen** wählen Sie neben dem Zeitraum jetzt auch ein Produkt, zum Beispiel nur Kfz. Leads, Termine, Abschlüsse, Provision, offene Chancen und das Werbebudget aus den Kampagnen dieses Produkts zeigen dann nur dieses Produkt; die Betreuung wird anteilig nach Leads verteilt.'
WHERE "id" = 'upd_2611_wachstum_produkt';
