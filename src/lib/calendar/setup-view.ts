// Daten für die Kalender-Oberflächen (Einrichtung, Mein Kalender, Kundenakte).
// Gibt nur Anzeige-Werte heraus, keine Links oder Zugangsdaten.

import { prisma } from "@/lib/prisma";
import { userIdOfKey } from "@/lib/calendar/tokens";
import { loadLeadTimes, scheduleFromTimes, type LeadTimes } from "@/lib/calendar/lead-times";
import { beratungszeitenText } from "@/lib/calendar/zeiten-gleich";
import { einladungsAdresse } from "@/lib/calendar/app-kalender";
import { loadSources, upcomingBlocks, type AllianzSummary } from "@/lib/calendar/sources";
import { meetOderTeams, videoWeg, type VideoWeg } from "@/lib/video-raum";

const PROVIDER: Record<string, string> = { google: "Google-Kalender", microsoft: "Outlook-Kalender", app: "App-Kalender" };

export type CalendarSetupView = {
  status: {
    /** meetOderTeams: Google bzw. Microsoft verbunden, dann entsteht der Videoraum je Termin automatisch (lib/video-raum.ts). */
    native: { connected: boolean; label: string | null; account?: string | null; app?: boolean; meetOderTeams?: boolean };
    hasIcs: boolean;
    /** „Ich habe keinen Online-Kalender“ gewählt (App-Kalender mit festen Beratungszeiten, 25.11.2026) */
    ohneOnlineKalender?: boolean;
    allianz: {
      orgName: string;
      templateName: string;
      durationMin: number;
      lastError: string | null;
      /** Vor dem frühesten Allianz-Buchungstag bietet die App keine Termine an (kein Google/Outlook verbunden). */
      abFruehestemTag: boolean;
    } | null;
  };
  allianz: AllianzSummary | null;
  /** Quelle der belegten Zeiten des Agentur-Kalenders (für den Hinweis bei den Lead-Zeiten). */
  source: "none" | "ics" | "allianz" | "ohne";
  leadTimes: LeadTimes;
  /** Lead-Zeiten als Text („Mo bis Fr, 10 bis 17 Uhr“) für „Ich habe keinen Online-Kalender“ */
  beratungszeiten: string | null;
  /** Adresse für Einladungen des App-Kalenders (nur Agentur-Kalender) */
  einladungAn: string | null;
  /** Fester Video-Link (z. B. Webex) des Agentur-Kalenders */
  videoRoomUrl: string | null;
  /** Woher der Videoraum kommt (Hinweis am Video-Link, lib/video-raum.ts) */
  videoWeg: VideoWeg;
  /** Microsoft verbunden, aber beim letzten Videotermin kam kein Teams-Link (AgentConfig.teamsLinkFehltAt) */
  teamsLinkFehlt: boolean;
  blocks: Awaited<ReturnType<typeof upcomingBlocks>>;
};

/** customerId = Kunde, calendarKey = Agentur-Kalender (customerId) oder user:<id>. */
export async function loadCalendarSetup(customerId: string, calendarKey: string): Promise<CalendarSetupView> {
  const userId = userIdOfKey(calendarKey);
  const [sources, native, leadTimes, blocks, agent, einladungAn] = await Promise.all([
    loadSources(customerId),
    userId
      ? prisma.advisorCalendar.findUnique({ where: { userId }, select: { status: true, provider: true, accountEmail: true } })
      : prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, provider: true, accountEmail: true } }),
    loadLeadTimes(calendarKey),
    upcomingBlocks(calendarKey),
    prisma.agentConfig.findUnique({ where: { customerId }, select: { videoRoomUrl: true, teamsLinkFehltAt: true } }),
    userId ? Promise.resolve(null) : einladungsAdresse(customerId).catch(() => null),
  ]);
  const a = sources.allianz;
  // Google/Outlook des Agentur-Kalenders liefert belegte Zeiten auch vor dem frühesten Allianz-Buchungstag (lib/calendar/index.ts)
  const eigenerKalender = !userId && native?.status === "connected" && native.provider !== "app";
  return {
    status: {
      native: {
        connected: native?.status === "connected",
        label: native ? (PROVIDER[native.provider] ?? "Kalender") : null,
        account: native?.accountEmail ?? null,
        // App-Kalender (lib/calendar/app-kalender.ts): Termine per Mail-Einladung, Google/Outlook bleibt wählbar
        app: native?.status === "connected" && native.provider === "app",
        meetOderTeams: meetOderTeams(native),
      },
      hasIcs: sources.hasIcs,
      ohneOnlineKalender: !userId && sources.ohneOnlineKalender && native?.status === "connected" && native.provider === "app",
      allianz: a
        ? {
            orgName: a.orgName,
            templateName: a.templateName,
            durationMin: a.durationMin,
            lastError: a.lastError,
            abFruehestemTag: a.bookingDayEarliest > 0 && !eigenerKalender,
          }
        : null,
    },
    allianz: a,
    // ICS und Allianz-Online gelten nur für den Agentur-Kalender.
    // Berater mit App-Kalender: freie Zeiten aus dem Allianz-Online-Kalender (lib/calendar/berater-allianz.ts)
    source: userId
      ? a && native?.provider === "app"
        ? "allianz"
        : "none"
      : a
        ? "allianz"
        : sources.hasIcs
          ? "ics"
          : sources.ohneOnlineKalender && native?.status === "connected" && native.provider === "app"
            ? "ohne"
            : "none",
    leadTimes,
    beratungszeiten: beratungszeitenText(scheduleFromTimes(leadTimes).days),
    einladungAn,
    videoRoomUrl: agent?.videoRoomUrl ?? null,
    videoWeg: videoWeg({ verbindung: native, hasIcs: sources.hasIcs, allianz: !!a }),
    teamsLinkFehlt: !!agent?.teamsLinkFehltAt && meetOderTeams(native) && native?.provider === "microsoft",
    blocks,
  };
}
