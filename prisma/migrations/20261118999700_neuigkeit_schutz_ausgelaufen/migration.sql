-- Neuigkeit (18.11.2026): Vorbelegung „Was hat Frau Becker schon?“ erkennt ausgelaufene, gekündigte und frühere Verträge
-- als „Nein“ und unsichere Angaben als „Weiß nicht“ (vorher „Ja, woanders“, auf der Folie dann „ersetzt Ihren bisherigen
-- Vertrag“). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_schutz_ausgelaufen', 'Was hat Ihr Kunde schon: ausgelaufene Verträge erkannt',
 'Schreibt Ihr Kunde im Chat, dass ein Vertrag ausgelaufen, gekündigt oder „nicht mehr“ da ist, steht unter **Termin vorbereiten → Schritt 1** bei dieser Versicherung jetzt „Nein“ statt „Ja, woanders“. Bei unklaren Angaben steht „Weiß nicht“, damit Sie im Termin kurz nachfragen; die Präsentation zeigt Ihrem Kunden so keinen Wechsel, wo es nichts zu wechseln gibt.',
 'verbessert', 'software', '2026-11-18 19:25:00', '2026-11-18 19:25:00', '2026-11-18 19:25:00')
ON CONFLICT ("id") DO NOTHING;
