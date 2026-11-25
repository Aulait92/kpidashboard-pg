-- Neuigkeiten (25.11.2026, Usability-Check): Rückmeldung zu gekauften Leads mit einem Tipp und Karte „Heute fällig“. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2511_ppl_rueckmeldung', 'Gekaufte Leads mit einem Tipp zurückmelden',
 'Wie lief Ihr Anruf? Das melden Sie jetzt direkt in der E-Mail zum Lead oder in Ihrer Leadliste mit einem Tipp: **Erreicht**, **Nicht erreicht** oder **Termin vereinbart**. Bei „Nicht erreicht“ legt die App die Wiedervorlage für den nächsten Werktag um 9 Uhr an.',
 'neu', 'software', now(), now(), now()),
('upd_2511_heute_faellig', 'Heute fällig: Wiedervorlagen auf einen Blick',
 'Auf **Heute** stehen fällige Wiedervorlagen jetzt in einer eigenen Karte, überfällige zuerst. Ein Tipp auf **Erledigt** oder **Morgen** genügt, und die Erinnerung am Morgen nennt sie werktags mit.',
 'verbessert', 'alle', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
