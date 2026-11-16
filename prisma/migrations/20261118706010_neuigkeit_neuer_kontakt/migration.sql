-- Neuigkeit: WhatsApp nur für Leads, „Neuer Kontakt“ und „Als Lead übernehmen“ (16.11.2026, Ole). Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_neuer_kontakt', 'Assistent schreibt nur Ihren Leads',
 'Schreibt Ihnen eine Nummer, die zu keinem Lead gehört, antwortet der Assistent nicht. Der Chat steht unter **Nachrichten** als „Neuer Kontakt“, und Sie entscheiden mit **Als Lead übernehmen**, ob der Assistent übernimmt. Ihre bestehenden Chats aus der WhatsApp Business App bleiben privat. Auf Wunsch schalten wir den Assistenten auch für neue Kontakte ein.',
 'verbessert', 'software', '2026-11-16 20:42:00', '2026-11-16 20:42:00', '2026-11-16 20:42:00')
ON CONFLICT ("id") DO NOTHING;
