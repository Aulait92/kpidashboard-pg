-- Neuigkeit (17.11.2026): Nächste Nachrichten am Kontakt, Zeile auf „Heute“, Ablaufübersicht (Paket P6). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_naechste_nachrichten', 'Sehen, was Ihr Assistent als Nächstes schickt',
 'Im Kontakt zeigt **Nächste Nachrichten**, welche WhatsApp, E-Mails und Erinnerungen wann rausgehen, mit Vorschau des Textes. Jede Nachricht können Sie sofort senden, verschieben oder überspringen, mit **Alle pausieren** halten Sie alles an, auch die Termin-Erinnerungen. Den ganzen Ablauf sehen Sie unter **Einstellungen → Assistent → Ablauf**.',
 'neu', 'software', '2026-11-17 23:45:00', '2026-11-17 23:45:00', '2026-11-17 23:45:00')
ON CONFLICT ("id") DO NOTHING;
