// Termin ohne Ergebnis (Ole, 25.11.2026, Auswertung Kunde Lohmann): Bleibt ein Termin eines Leads bis zum nächsten
// Werktag ohne Ergebnis (Appointment.status noch „booked“), bekommt der zuständige Berater (sonst der Inhaber) ab 8 Uhr
// Berlin EINEN Push „Wie lief der Termin mit Anna?“ mit Link direkt auf „Wie lief der Termin?“ (/buyer/termine/<id>).
// Bisher gab es dazu nur die Sammel-Erinnerung um 8 Uhr („bei 2 Terminen fehlt das Ergebnis“, lib/next-step-reminder.ts)
// ohne Weg zum einzelnen Termin. Höchstens ein Push je Termin (Appointment.ergebnisPushAt), nur werktags 8 bis 20 Uhr,
// nicht an reine Pay-per-Lead-Kunden, nicht an Logins mit ausgeschalteter „Täglicher Erinnerung um 8 Uhr“.
// Kommt der Push an (Appointment.ergebnisPushOkAt), fällt der Termin aus der Sammel-Erinnerung (nichts doppelt am
// Morgen); kommt er nicht an (kein Gerät, Erinnerung aus), bleibt er dort. Der Cron ruft diesen Lauf vor der
// Sammel-Erinnerung auf.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { NUR_PPL_WHERE } from "@/lib/customer-package";
import { OPEN_STEP_STATUSES } from "@/lib/lead-next-step";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { kontaktParts } from "@/lib/ansprache";
import { leadLabel } from "@/lib/showup";
import { isWorkdayKey } from "@/lib/vertrieb/spaeter";

const TZ = "Europe/Berlin";
/** Push-Fenster (Berlin): ab 8 Uhr, nicht abends bzw. nachts. */
export const PUSH_VON = 8;
export const PUSH_BIS = 20;
/** Ältere Termine nicht mehr nachträglich anstoßen (Wochenende und Feiertag eingerechnet). */
const RUECKBLICK_TAGE = 5;

const berlinDayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

/** Beginn des Berliner Kalendertags von d (wie lib/abschluss-server.ts berlinDayStart). */
export function berlinTagesbeginn(d: Date): Date {
  const guess = new Date(`${berlinDayKey(d)}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess));
  return new Date(guess.getTime() - (h >= 12 ? h - 24 : h) * 3600_000);
}

const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));

/** Jetzt Zeit für den Push? Werktag (ohne bundesweite Feiertage), 8 bis 20 Uhr Berlin. Rein. */
export function ergebnisPushZeit(now: Date): boolean {
  const h = berlinStunde(now);
  return h >= PUSH_VON && h < PUSH_BIS && isWorkdayKey(berlinDayKey(now));
}

/** Text des Pushs (Vermittler-Oberfläche, Sie-Form, ohne Gedankenstriche). Rein. */
export function ergebnisPushText(o: { appointmentId: string; vorname: string | null; label: string }) {
  const wer = o.vorname?.trim() || o.label;
  return {
    title: `Wie lief der Termin mit ${wer}?`,
    body: "Das Ergebnis fehlt noch. Ein Tipp genügt, den Rest trägt die App ein.",
    url: `/buyer/termine/${o.appointmentId}`,
    tag: `termin-ergebnis:${o.appointmentId}`,
  };
}

type PushPayload = { title: string; body: string; url: string; tag: string };
/** Push senden; Rückgabe: an so viele Geräte zugestellt (0 = niemand hat ein Gerät mit Mitteilungen). */
export type ErgebnisPushFn = (userIds: string[] | null, customerId: string, p: PushPayload) => Promise<number>;

const standardPush: ErgebnisPushFn = async (userIds, customerId, p) => {
  const m = await import("@/lib/push");
  if (!userIds) return (await m.sendToBuyersOfCustomer(customerId, p)).sent;
  let sent = 0;
  for (const id of userIds) sent += (await m.sendToUser(id, p)).sent;
  return sent;
};

/** Empfänger: zuständiger Berater (Lead, sonst Kalender des Termins), sonst Inhaber; null = alle Logins des Kunden. */
async function empfaenger(t: { customerId: string; calendarKey: string | null; lead: { assignedUserId: string | null } | null }): Promise<string[] | null> {
  const zustaendig = t.lead?.assignedUserId ?? (t.calendarKey?.startsWith("user:") ? t.calendarKey.slice(5) : null);
  if (zustaendig) {
    const u = await prisma.user.findFirst({ where: { id: zustaendig, customerId: t.customerId, role: "BUYER" }, select: { id: true, nextStepReminder: true } });
    if (u) return u.nextStepReminder ? [u.id] : [];
  }
  const inhaber = await prisma.user.findMany({ where: { customerId: t.customerId, role: "BUYER", teamRole: "owner" }, select: { id: true, nextStepReminder: true } });
  if (inhaber.length) return inhaber.filter((u) => u.nextStepReminder).map((u) => u.id);
  return null;
}

export type ErgebnisPushErgebnis = { due: boolean; termine: number; pushes: number };

/** Cron (alle 5 Minuten): Termine von vor heute ohne Ergebnis, je Termin höchstens ein Push. */
export async function runTerminErgebnisPush(now = new Date(), deps: { push?: ErgebnisPushFn } = {}): Promise<ErgebnisPushErgebnis> {
  if (!ergebnisPushZeit(now)) return { due: false, termine: 0, pushes: 0 };
  const push = deps.push ?? standardPush;
  const heute = berlinTagesbeginn(now);
  const where: Prisma.AppointmentWhereInput = {
    status: "booked",
    ergebnisPushAt: null,
    leadId: { not: null },
    startsAt: { lt: heute, gte: new Date(heute.getTime() - RUECKBLICK_TAGE * 86_400_000) },
    OR: [{ attendance: null }, { attendance: { not: "nicht_erschienen" } }],
    customer: { archived: false, dormantSince: null, NOT: NUR_PPL_WHERE },
    lead: { is: { erasedAt: null, closedAt: null, OR: [{ status: null }, { status: { in: [...OPEN_STEP_STATUSES] } }] } },
  };
  const termine = await prisma.appointment.findMany({
    where,
    select: { id: true, customerId: true, calendarKey: true, lead: { select: { name: true, formData: true, contactOverrides: true, assignedUserId: true } } },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  const res: ErgebnisPushErgebnis = { due: true, termine: termine.length, pushes: 0 };
  for (const t of termine) {
    // Beanspruchen: nie zweimal, auch bei parallelen Läufen
    const claimed = await prisma.appointment.updateMany({ where: { id: t.id, ergebnisPushAt: null, status: "booked" }, data: { ergebnisPushAt: now } });
    if (!claimed.count) continue;
    const kontakt = kontaktFromLead(t.lead);
    const p = ergebnisPushText({ appointmentId: t.id, vorname: kontaktParts(kontakt).first || null, label: leadLabel(kontakt, t.lead?.name) });
    const an = await empfaenger(t);
    if (an && an.length === 0) continue;
    const sent = await push(an, t.customerId, p).catch((e) => {
      console.error("[termin-ergebnis push]", e instanceof Error ? e.message : e);
      return 0;
    });
    // Angekommen: Termin fällt aus der Sammel-Erinnerung um 8 Uhr (lib/next-step-reminder.ts); sonst bleibt er dort
    if (sent > 0) await prisma.appointment.update({ where: { id: t.id }, data: { ergebnisPushOkAt: now } });
    res.pushes++;
  }
  return res;
}
