-- @auch-beim-einmessen
-- Startwerte der Buchungsseite (wiederholbar): auch auf neu eingemessenen Datenbanken (CI, scripts/migrate.mjs),
-- wo 20261118705300 nur als angewendet eingetragen wird. In Produktion ohne Wirkung (ON CONFLICT DO NOTHING).
INSERT INTO "Customer" ("id", "name", "plan")
VALUES ('cust_pg_vertrieb', 'performancegrowth Vertrieb', 'internal')
ON CONFLICT DO NOTHING;

-- Zwei Termintypen (Ole, 16.11.2026): Erstgespräch (Standard unter /termin) und Folgetermin nach dem Angebot
INSERT INTO "SalesBookingType" ("id", "slug", "title", "subtitle", "confirmText", "thanksPage", "durationMin", "mode", "calendarKeys", "sortOrder", "updatedAt")
VALUES
  ('sbt_meta_leads_call', 'meta-leads-call', 'Meta-Leads-Call mit Ole Kannapinn',
   'Kostenloses Erstgespräch: Wie Sie mit Meta-Leads planbar neue Kunden gewinnen.',
   'Zur Vorbereitung haben wir ein kurzes Video für Sie. So holen wir im Gespräch das Meiste für Sie heraus.',
   true, 45, 'video', ARRAY['cust_pg_vertrieb'], 0, CURRENT_TIMESTAMP),
  ('sbt_entscheidung', 'entscheidung', 'Entscheidungs-Call mit Ole Kannapinn',
   'Wir gehen Ihr Angebot gemeinsam durch und klären Ihre offenen Fragen.',
   'Legen Sie sich Ihr Angebot gern bereit. Offene Fragen klären wir direkt im Gespräch.',
   false, 30, 'video', ARRAY['cust_pg_vertrieb'], 1, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
