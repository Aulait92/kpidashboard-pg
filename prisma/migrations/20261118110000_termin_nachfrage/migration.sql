-- Nach jedem Termin: Aufgabe „Wie lief der Termin?“ (Merker je Calendly-Termin)
ALTER TABLE "SalesMeeting" ADD COLUMN "reviewTaskId" TEXT;
