-- Neuigkeit (27.11.2026, Anruf-Ergebnis mit einem Tipp, Notizen als Anrufversuch, Anrufliste aus Kontakte,
-- Wochen-Mail für Inhaber mit Team). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2711_anruf_ergebnis', 'Anruf-Ergebnis mit einem Tipp, auch vom Bürotelefon',
 'Unter den Knöpfen im Kontakt tragen Sie nach einem Anruf mit einem Tipp ein: **Erreicht**, **Nicht erreicht** oder **Falsche Nummer**, egal, von welchem Telefon Sie angerufen haben. Schreiben Sie lieber eine Notiz wie „nicht erreicht“, zählt die App sie als Anrufversuch und plant den nächsten. Fällige Anrufe arbeiten Sie unter **Kontakte → Zu erledigen → Anrufliste starten** nacheinander ab; Inhaber mit Team bekommen montags eine kurze Wochen-Mail.',
 'verbessert', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
