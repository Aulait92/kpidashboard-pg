-- Eigene Buchungsseite für Vertriebstermine (/termin, lib/vertrieb/buchung.ts), parallel zu Calendly.
-- Interner Mandant hält nur den Kalender (CalendarConnection, Zeiten je Wochentag, Blocker);
-- plan "internal" = taucht in Zahlen, Abrechnung und Auswertungen nicht auf. Keine Logins.
INSERT INTO "Customer" ("id", "name", "plan")
VALUES ('cust_pg_vertrieb', 'performancegrowth Vertrieb', 'internal')
ON CONFLICT DO NOTHING;

CREATE TABLE "SalesBookingType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "confirmText" TEXT,
    "thanksPage" BOOLEAN NOT NULL DEFAULT false,
    "durationMin" INTEGER NOT NULL DEFAULT 45,
    "mode" TEXT NOT NULL DEFAULT 'video',
    "bufferMin" INTEGER NOT NULL DEFAULT 15,
    "noticeMin" INTEGER NOT NULL DEFAULT 240,
    "horizonDays" INTEGER NOT NULL DEFAULT 21,
    "videoUrl" TEXT,
    "calendarKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesBookingType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesBookingType_slug_key" ON "SalesBookingType"("slug");

ALTER TABLE "SalesMeeting" ADD COLUMN "bookingTypeId" TEXT,
ADD COLUMN "manageToken" TEXT,
ADD COLUMN "calendarKey" TEXT,
ADD COLUMN "calendarEventId" TEXT,
ADD COLUMN "inviteePhone" TEXT,
ADD COLUMN "consentAt" TIMESTAMP(3),
ADD COLUMN "consentText" TEXT,
ADD COLUMN "reminderSentAt" TIMESTAMP(3),
ADD COLUMN "soonReminderSentAt" TIMESTAMP(3),
ADD COLUMN "rescheduledFromId" TEXT,
ADD COLUMN "waReminderAt" TIMESTAMP(3),
ADD COLUMN "waSoonAt" TIMESTAMP(3),
ADD COLUMN "videoWatchedAt" TIMESTAMP(3),
ADD COLUMN "demoOpenedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "SalesMeeting_manageToken_key" ON "SalesMeeting"("manageToken");

CREATE INDEX "SalesMeeting_calendarKey_startAt_idx" ON "SalesMeeting"("calendarKey", "startAt");

ALTER TABLE "SalesMeeting" ADD CONSTRAINT "SalesMeeting_bookingTypeId_fkey" FOREIGN KEY ("bookingTypeId") REFERENCES "SalesBookingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
