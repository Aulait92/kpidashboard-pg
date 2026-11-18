// Komplettcheck = Ja → 45 Minuten (Ole, 17.11.2026): Termin verlängern, wenn der Kalender es hergibt. Dann das
// Kalenderereignis anpassen (der Kalender schickt die Aktualisierung an die Teilnehmer). Der Lead bekommt die Einladung
// erst mit der endgültigen Dauer (lib/calendar/einladung.ts); war sie schon raus, EINE Aktualisierung („jetzt 45
// Minuten“, gleiche UID). Ist die Zeit danach belegt: mit angebot zwei andere Zeiten mit 45 Min. anbieten
// (termin-strecke.ts), der Lead wählt eine (komplettcheckVerlegen) oder behält seine (komplettcheckHinweis); sonst
// gleich der Hinweis an den Vermittler (Push und Verlauf). Keine neuen Google/MS-Rechte. Aufgerufen aus
// lib/whatsapp/termin-strecke.ts.

import { prisma } from "@/lib/prisma";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { logLeadHistory } from "@/lib/lead-history";
import { KOMPLETTCHECK_DAUER_MIN, leadLabel, terminEnde } from "@/lib/showup";
import { standardPush, terminSelect, zustaendig, type PushFn } from "@/lib/showup-server";
import type { Busy } from "@/lib/calendar/tokens";

const MIN = 60 * 1000;

type Kalender = {
  getBusy: (min: Date, max: Date) => Promise<Busy[]>;
  updateEventEnd: (id: string, end: Date) => Promise<void>;
  updateEventTime?: (id: string, start: Date, end: Date) => Promise<void>;
};

/** Verlängern bzw. Hinweis, einmal je Termin; wirft nie. */
export async function komplettcheckVerlaengern(
  appointmentId: string,
  deps: { push?: PushFn; now?: Date; kalender?: (key: string) => Promise<Kalender>; angebot?: boolean } = {},
): Promise<"verlaengert" | "hinweis" | "belegt" | "schon_lang" | "nichts"> {
  const now = deps.now ?? new Date();
  try {
    const t = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { ...terminSelect, leadId: true, status: true, calendarEventId: true, verlaengerung: true },
    });
    if (!t || t.status !== "booked" || t.verlaengerung || t.startsAt.getTime() <= now.getTime()) return "nichts";
    const ende = terminEnde(t);
    const ziel = new Date(t.startsAt.getTime() + KOMPLETTCHECK_DAUER_MIN * MIN);
    if (ende.getTime() >= ziel.getTime()) return "schon_lang";
    const claimed = await prisma.appointment.updateMany({ where: { id: t.id, verlaengerung: null }, data: { verlaengerung: "pruefen", verlaengerungAt: now } });
    if (!claimed.count) return "nichts";
    let frei = false;
    if (t.calendarEventId) {
      try {
        const kalender = deps.kalender ?? (async (key: string) => (await import("@/lib/calendar")).adapterFor(key));
        const k = await kalender(t.calendarKey ?? t.customerId);
        // Der eigene Termin endet bei `ende`; belegt ist nur, was in die zusätzlichen Minuten fällt
        frei = !(await k.getBusy(ende, ziel)).some((b) => b.start < ziel && b.end > ende);
        if (frei) await k.updateEventEnd(t.calendarEventId, ziel);
      } catch (err) {
        console.error("[komplettcheck verlängern]", err instanceof Error ? err.message : err);
        frei = false;
      }
    }
    if (frei) {
      await prisma.appointment.update({ where: { id: t.id }, data: { endsAt: ziel, verlaengerung: "verlaengert", verlaengerungAt: now } });
      // Einladung schon raus: EINE Aktualisierung (gleiche UID); sonst trägt die spätere Einladung die 45 Min.
      await import("@/lib/calendar/einladung").then((m) => m.einladungAktualisieren(t.id, "dauer", now)).catch(() => null);
      if (t.leadId) await logLeadHistory(t.leadId, "notiz", `Termin wegen Komplettcheck auf ${KOMPLETTCHECK_DAUER_MIN} Minuten verlängert`, { customerId: t.customerId, userId: null });
      return "verlaengert";
    }
    // Belegt: zwei andere Zeiten mit 45 Min. anbieten (termin-strecke.ts), erst danach einladen
    if (deps.angebot) {
      await prisma.appointment.update({ where: { id: t.id }, data: { verlaengerung: "angebot", verlaengerungAt: now } });
      return "belegt";
    }
    return komplettcheckHinweis(t.id, deps);
  } catch (err) {
    console.error("[komplettcheck verlängern]", err instanceof Error ? err.message : err);
    return "nichts";
  }
}

/** Hinweis an den Vermittler (Push und Verlauf): mehr Zeit einplanen, der Termin bleibt bei 30 Min.; wirft nie. */
export async function komplettcheckHinweis(appointmentId: string, deps: { push?: PushFn; now?: Date } = {}): Promise<"hinweis" | "nichts"> {
  const now = deps.now ?? new Date();
  try {
    const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { ...terminSelect, leadId: true, status: true } });
    if (!t || t.status !== "booked") return "nichts";
    const name = leadLabel(kontaktFromLead(t.lead));
    await prisma.appointment.update({ where: { id: t.id }, data: { verlaengerung: "hinweis", verlaengerungAt: now } });
    const push = deps.push ?? standardPush;
    await push(zustaendig(t), t.customerId, {
      title: `Komplettcheck mit ${name}`,
      body: `${name} wünscht einen Komplettcheck. Der Termin ließ sich nicht auf ${KOMPLETTCHECK_DAUER_MIN} Minuten verlängern, bitte planen Sie mehr Zeit ein.`,
      url: `/buyer/termine/${t.id}`,
      tag: `komplettcheck:${t.id}`,
    }).catch((e) => console.error("[komplettcheck push]", e));
    if (t.leadId) {
      await logLeadHistory(t.leadId, "notiz", `Komplettcheck gewünscht: Termin nicht auf ${KOMPLETTCHECK_DAUER_MIN} Minuten verlängert (Kalender belegt), bitte mehr Zeit einplanen`, {
        customerId: t.customerId,
        userId: null,
      });
    }
    return "hinweis";
  } catch (err) {
    console.error("[komplettcheck verlängern]", err instanceof Error ? err.message : err);
    return "nichts";
  }
}

/**
 * Andere Zeit mit 45 Min. (Lead hat eine der angebotenen Zeiten gewählt): derselbe Termin wird verlegt (Kalender des
 * Vermittlers, gleiche Einladung), nur wenn die Zeit noch frei ist. Einladung schon raus: EINE Aktualisierung.
 */
export async function komplettcheckVerlegen(
  appointmentId: string,
  startIso: string,
  deps: { now?: Date; kalender?: (key: string) => Promise<Kalender> } = {},
): Promise<"verlegt" | "belegt" | "nichts"> {
  const now = deps.now ?? new Date();
  try {
    const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { ...terminSelect, status: true, calendarEventId: true, leadId: true } });
    const start = new Date(startIso);
    if (!t || t.status !== "booked" || Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) return "nichts";
    const ende = new Date(start.getTime() + KOMPLETTCHECK_DAUER_MIN * MIN);
    const altEnde = terminEnde(t);
    if (t.calendarEventId) {
      const kalender = deps.kalender ?? (async (key: string) => (await import("@/lib/calendar")).adapterFor(key));
      const k = await kalender(t.calendarKey ?? t.customerId);
      // Der eigene Termin (alte Zeit) zählt nicht als belegt
      const belegt = (await k.getBusy(start, ende)).some((b) => b.start < ende && b.end > start && !(b.start.getTime() === t.startsAt.getTime() && b.end.getTime() === altEnde.getTime()));
      if (belegt) return "belegt";
      if (!k.updateEventTime) return "nichts";
      await k.updateEventTime(t.calendarEventId, start, ende);
    }
    await prisma.appointment.update({
      where: { id: t.id },
      data: { startsAt: start, endsAt: ende, verlaengerung: "verlaengert", verlaengerungAt: now, reminderSentAt: null, soonReminderSentAt: null, startReminderSentAt: null },
    });
    if (t.leadId) await logLeadHistory(t.leadId, "notiz", `Termin wegen Komplettcheck auf eine Zeit mit ${KOMPLETTCHECK_DAUER_MIN} Minuten verlegt`, { customerId: t.customerId, userId: null });
    await import("@/lib/calendar/einladung").then((m) => m.einladungAktualisieren(t.id, "zeit", now)).catch(() => null);
    return "verlegt";
  } catch (err) {
    console.error("[komplettcheck verlegen]", err instanceof Error ? err.message : err);
    return "nichts";
  }
}
