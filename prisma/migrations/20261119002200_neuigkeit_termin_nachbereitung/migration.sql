-- Neuigkeit (19.11.2026, UX-Runde Team C): Terminseite mit „Wie lief der Termin?“ und Abschluss in einem Zug, Zusage und
-- Erinnerungen am Termin sichtbar, Meine Provisionen als kurze Liste. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_termin_nachbereitung', 'Nach dem Termin: Ergebnis und Abschluss in einem Zug',
 'Öffnen Sie einen Termin nach dem Gespräch, fragt die App direkt „Wie lief der Termin?“. Mit **Abschluss** tragen Sie gleich Beitrag und Glückwunsch ein. Vor dem Termin sehen Sie dort, ob Ihr Kunde zugesagt hat und welche Erinnerungen er bekommt, und können einzelne mit einem Tipp überspringen. **Einstellungen → Meine Provisionen** zeigt Ihre Sätze jetzt als kurze Liste zum Aufklappen.',
 'verbessert', 'software', now(), now(), now())
ON CONFLICT ("id") DO NOTHING;
