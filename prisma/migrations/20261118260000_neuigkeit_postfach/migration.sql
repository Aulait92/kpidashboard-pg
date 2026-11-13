-- Neuigkeit: E-Mails aus dem eigenen Postfach mit Vorlagen
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_postfach', 'E-Mails an Leads aus Ihrem eigenen Postfach',
 'Verbinden Sie unter **Einstellungen → E-Mail-Postfach** Ihr Postfach (Google, Microsoft oder SMTP). Danach schreiben Sie Leads direkt aus der App an – mit Vorlagen und auf Wunsch mit dem Angebot im Anhang. Jede E-Mail steht anschließend im Verlauf des Leads.',
 'neu', 'alle', '2026-11-13 22:47:00', '2026-11-13 22:47:00', '2026-11-13 22:47:00')
ON CONFLICT ("id") DO NOTHING;
