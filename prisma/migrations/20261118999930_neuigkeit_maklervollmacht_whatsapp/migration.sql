-- Neuigkeit (18.11.2026): Maklervollmacht per WhatsApp mit einer Erinnerung, „Eigene Vollmacht liegt vor“ und die Frage
-- „Wer schickt sie Ihren Kunden?“ (nur Makler). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_maklervollmacht_whatsapp', 'Für Makler: Maklervollmacht per WhatsApp senden',
 'In der Karte **Maklervollmacht** im Kontakt schicken Sie den Link jetzt mit **Per WhatsApp senden** direkt in den Chat mit Ihrem Kunden; unterschreibt er nicht, erinnert die App nach 2 Tagen einmal. Haben Sie schon eine eigene Vollmacht, haken Sie unter **Mehr** „Eigene Vollmacht liegt bereits vor“ an. Unter **Einstellungen → Assistent** legen Sie fest, ob die App die Vollmacht schickt oder Sie Ihre eigene nutzen.',
 'neu', 'alle', '2026-11-18 22:10:00', '2026-11-18 22:10:00', '2026-11-18 22:10:00')
ON CONFLICT ("id") DO NOTHING;
