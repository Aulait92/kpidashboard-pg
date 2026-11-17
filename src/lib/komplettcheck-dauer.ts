// Komplettcheck = Ja → 45 Minuten (Ole, 17.11.2026): Termin verlängern, wenn der Kalender es hergibt. Dann das
// Kalenderereignis anpassen (der Kalender schickt die Aktualisierung an die Teilnehmer) und dem Lead die Mail „jetzt 45
// Minuten“ mit aktualisierter Kalenderdatei schicken. Sonst Hinweis an den Vermittler (Push und Verlauf). Keine neuen
// Google/MS-Rechte: dieselben wie beim Anlegen des Termins. Aufgerufen aus lib/whatsapp/termin-strecke.ts.

import { prisma } from "@/lib/prisma";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { logLeadHistory } from "@/lib/lead-history";
import { KOMPLETTCHECK_DAUER_MIN, leadLabel, terminEnde } from "@/lib/showup";
import { standardPush, terminSelect, zustaendig, type PushFn } from "@/lib/showup-server";
import type { Busy } from "@/lib/calendar/tokens";

const MIN = 60 * 1000;

type Kalender = { getBusy: (min: Date, max: Date) => Promise<Busy[]>; updateEventEnd: (id: string, end: Date) => Promise<void> };

/** Verlängern bzw. Hinweis, einmal je Termin; wirft nie. */
export async function komplettcheckVerlaengern(
  appointmentId: string,
  deps: { push?: PushFn; now?: Date; kalender?: (key: string) => Promise<Kalender> } = {},
): Promise<"verlaengert" | "hinweis" | "schon_lang" | "nichts"> {
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
    const name = leadLabel(kontaktFromLead(t.lead));
    if (frei) {
      await prisma.appointment.update({ where: { id: t.id }, data: { endsAt: ziel, verlaengerung: "verlaengert", verlaengerungAt: now } });
      const { sendLeadEmail } = await import("@/lib/calendar/lead-email");
      await sendLeadEmail(t.id, "updated", { now }).catch(() => null);
      if (t.leadId) await logLeadHistory(t.leadId, "notiz", `Termin wegen Komplettcheck auf ${KOMPLETTCHECK_DAUER_MIN} Minuten verlängert`, { customerId: t.customerId, userId: null });
      return "verlaengert";
    }
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
