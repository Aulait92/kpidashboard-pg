// Daten für die Kalender-Oberflächen (Einrichtung, Mein Kalender, Kundenakte).
// Gibt nur Anzeige-Werte heraus, keine Links oder Zugangsdaten.

import { prisma } from "@/lib/prisma";
import { userIdOfKey } from "@/lib/calendar/tokens";
import { loadLeadTimes, type LeadTimes } from "@/lib/calendar/lead-times";
import { loadSources, upcomingBlocks, type AllianzSummary } from "@/lib/calendar/sources";

const PROVIDER: Record<string, string> = { google: "Google-Kalender", microsoft: "Outlook-Kalender", app: "App-Kalender" };

export type CalendarSetupView = {
  status: {
    native: { connected: boolean; label: string | null; account?: string | null; app?: boolean };
    hasIcs: boolean;
    allianz: { orgName: string; templateName: string; durationMin: number; lastError: string | null } | null;
  };
  allianz: AllianzSummary | null;
  /** Quelle der belegten Zeiten des Agentur-Kalenders (für den Hinweis bei den Lead-Zeiten). */
  source: "none" | "ics" | "allianz";
  leadTimes: LeadTimes;
  /** Fester Video-Link (z. B. Webex) des Agentur-Kalenders */
  videoRoomUrl: string | null;
  blocks: Awaited<ReturnType<typeof upcomingBlocks>>;
};

/** customerId = Kunde, calendarKey = Agentur-Kalender (customerId) oder user:<id>. */
export async function loadCalendarSetup(customerId: string, calendarKey: string): Promise<CalendarSetupView> {
  const userId = userIdOfKey(calendarKey);
  const [sources, native, leadTimes, blocks, agent] = await Promise.all([
    loadSources(customerId),
    userId
      ? prisma.advisorCalendar.findUnique({ where: { userId }, select: { status: true, provider: true, accountEmail: true } })
      : prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, provider: true, accountEmail: true } }),
    loadLeadTimes(calendarKey),
    upcomingBlocks(calendarKey),
    prisma.agentConfig.findUnique({ where: { customerId }, select: { videoRoomUrl: true } }),
  ]);
  const a = sources.allianz;
  return {
    status: {
      native: {
        connected: native?.status === "connected",
        label: native ? (PROVIDER[native.provider] ?? "Kalender") : null,
        account: native?.accountEmail ?? null,
        // App-Kalender (lib/calendar/app-kalender.ts): Termine per Mail-Einladung, Google/Outlook bleibt wählbar
        app: native?.status === "connected" && native.provider === "app",
      },
      hasIcs: sources.hasIcs,
      allianz: a ? { orgName: a.orgName, templateName: a.templateName, durationMin: a.durationMin, lastError: a.lastError } : null,
    },
    allianz: a,
    // ICS und Allianz-Online gelten nur für den Agentur-Kalender.
    source: userId ? "none" : a ? "allianz" : sources.hasIcs ? "ics" : "none",
    leadTimes,
    videoRoomUrl: agent?.videoRoomUrl ?? null,
    blocks,
  };
}
