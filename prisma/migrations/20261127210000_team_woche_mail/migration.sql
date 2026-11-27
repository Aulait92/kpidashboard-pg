-- Wochen-Mail „Ihr Team diese Woche“ an Inhaber mit Team (Ole, 27.11.2026, lib/team-woche.ts)
ALTER TABLE "User" ADD COLUMN "teamWocheMailOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "teamWocheGesendet" TEXT;
