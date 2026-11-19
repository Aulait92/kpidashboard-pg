-- Neuigkeit (19.11.2026, UX-Runde Team B): Kontakte-Liste mit „Zu erledigen“, Eingang als „vor 4 Min.“, „Antwort wartet“
-- in der Liste, Kontakt zeigt zuerst, was wartet; Pipeline lesbarer. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_kontakte_zu_erledigen', 'Kontakte: sofort sehen, wer auf Sie wartet',
 'Unter **Kontakte → Zu erledigen** stehen alle Kontakte, bei denen Sie dran sind, das Dringendste zuerst: Antworten im Chat, neue Anfragen, fehlende Ergebnisse und fällige Wiedervorlagen. Neue Anfragen zeigen jetzt „vor 4 Min.“ statt des Datums, und im Kontakt steht ganz oben, was gerade auf Sie wartet.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
