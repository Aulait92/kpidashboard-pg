-- Neuigkeit: Nächster Schritt für jeden Lead, Verloren mit Grund und Anrufplan bei „nicht erreicht“
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_naechster_schritt', 'Nächster Schritt für jeden Lead',
 'Leads ohne nächsten Schritt sehen Sie jetzt oben auf **Heute** und als Zahl an **Kontakte**. Nach jedem Anruf fragt die App kurz, wie es weitergeht, und um 8 Uhr erinnert sie Sie (abschaltbar unter **Einstellungen → Benachrichtigungen**). Bei **Verloren** wählen Sie einen Grund, und bei „nicht erreicht“ plant die App bis zu 6 Anrufversuche zu verschiedenen Tageszeiten für Sie.',
 'neu', 'software', '2026-11-14 14:05:00', '2026-11-14 14:05:00', '2026-11-14 14:05:00')
ON CONFLICT ("id") DO NOTHING;
