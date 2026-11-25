-- Onboarding-Call (Ole, 25.11.2026): 60 Minuten per Video, bucht Ole selbst im Vertriebskontakt („Termin buchen“).
-- Nicht online buchbar (active = false), Kalender wie der Sales-Call.
INSERT INTO "SalesBookingType" ("id", "slug", "title", "subtitle", "confirmText", "thanksPage", "durationMin", "mode", "calendarKeys", "active", "sortOrder", "updatedAt")
VALUES ('sbt_onboarding', 'onboarding', 'Onboarding-Call mit Ole Kannapinn',
        'Wir richten gemeinsam alles für Ihren Start ein.',
        'Bitte halten Sie Ihre Zugänge zu Meta (Facebook) bereit. Wir richten im Termin gemeinsam alles für Ihren Start ein.',
        false, 60, 'video', ARRAY['cust_pg_vertrieb'], false, 3, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;
