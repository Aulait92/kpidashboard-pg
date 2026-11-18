-- Neuigkeit (18.11.2026): Leads ohne WhatsApp per E-Mail, Datenschutz-Anfragen auf Heute. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_ohne_whatsapp', 'Leads ohne WhatsApp bekommen sofort eine E-Mail',
 'Hat ein Lead kein WhatsApp, keine Handynummer oder nicht in WhatsApp eingewilligt, schreibt ihm Ihr Assistent binnen Minuten in Ihrem Namen eine E-Mail mit Erstinformation, einer kurzen Frage und zwei freien Zeiten; mit einem Klick bucht er, die Zeit ist sofort in Ihrem Kalender geblockt. Bittet ein Lead um Auskunft, Löschung oder keine Werbung mehr, bestätigt die App den Eingang, stoppt Werbung sofort und zeigt Ihnen die Anfrage mit Frist auf **Heute**.',
 'neu', 'software', '2026-11-18 03:55:00', '2026-11-18 03:55:00', '2026-11-18 03:55:00')
ON CONFLICT ("id") DO NOTHING;
