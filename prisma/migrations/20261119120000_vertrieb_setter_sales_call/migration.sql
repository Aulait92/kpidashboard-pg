-- Setter und Closer (Ole, 19.11.2026): Öffentlich unter performancegrowth.de/termin nur noch ein kurzes Telefonat
-- (15 Minuten, Ole ruft an): Budget grundsätzlich, Mitentscheider, Startzeitpunkt. Den Sales-Call (45 Minuten, Video)
-- bucht Ole selbst im Vertriebskontakt; er ist nicht online buchbar (active = false heißt „nicht online buchbar“,
-- Admins buchen jeden Termintyp).
UPDATE "SalesBookingType"
SET "title" = 'Kurzes Telefonat mit Ole Kannapinn',
    "subtitle" = '15 Minuten, kostenlos: Wir klären, ob planbare Neukunden über Meta für Sie passen.',
    "confirmText" = 'Ich rufe Sie zur vereinbarten Zeit an. Wenn Sie mögen, sehen Sie sich vorher das kurze Video an.',
    "durationMin" = 15,
    "mode" = 'phone',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'meta-leads-call';

INSERT INTO "SalesBookingType" ("id", "slug", "title", "subtitle", "confirmText", "thanksPage", "durationMin", "mode", "calendarKeys", "active", "sortOrder", "updatedAt")
VALUES ('sbt_sales_call', 'sales-call', 'Beratungsgespräch mit Ole Kannapinn',
        'Live-Demo, Rechnung mit Ihren Zahlen und Ihr Angebot.',
        'Bitte laden Sie alle ein, die mitentscheiden. Wenn es für Sie passt, starten wir direkt im Termin: Halten Sie dafür gern Ihre IBAN bereit.',
        false, 45, 'video', ARRAY['cust_pg_vertrieb'], false, 1, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

UPDATE "SalesBookingType" SET "sortOrder" = 2 WHERE "slug" = 'entscheidung';
