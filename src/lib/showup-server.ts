// Show-up-Paket, Datenbank-Teil (Ole, 17.11.2026; Regeln und Texte in lib/showup.ts):
//   runTerminBeginn (Cron)   Push „Ist Frau Becker da?“ zum Beginn eines Videotermins; nach „Fehlt noch“ ohne weitere
//                            Antwort bis Terminende die Rückfrage „Ist Frau Becker noch gekommen?“. Ohne jede Reaktion
//                            des Vermittlers geht nichts an den Lead, die Statusfrage steht nach dem Termin auf „Heute“.
//   setzeAnwesenheit         „Ja, da“ → erschienen; „Fehlt noch“ → WhatsApp „… wartet schon im Videoraum auf Sie: <Link>“
//                            (im Fenster Freitext, sonst Vorlage appt_waiting, nur vorbereitet) und Anruf-Knopf.
//                            „Nicht gekommen“ läuft über das Termin-Ergebnis (inbox-actions → No-Show-Rettung).
// Pushes gehen an den zuständigen Berater (Team), sonst an alle Logins des Kunden.

import { prisma } from "@/lib/prisma";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { logLeadHistory } from "@/lib/lead-history";
import {
  asAnwesenheit,
  leadLabel,
  nachherPush,
  startPush,
  terminEnde,
  wartetText,
  type Anwesenheit,
} from "@/lib/showup";

const MIN = 60 * 1000;

type PushPayload = { title: string; body: string; url: string; tag: string };
export type PushFn = (userId: string | null, customerId: string, p: PushPayload) => Promise<unknown>;

export const standardPush: PushFn = async (userId, customerId, p) => {
  const m = await import("@/lib/push");
  return userId ? m.sendToUser(userId, p) : m.sendToBuyersOfCustomer(customerId, p);
};

/** Zuständiger Berater: am Lead, sonst der Kalender, in dem der Termin liegt. */
export function zustaendig(t: { calendarKey: string | null; lead: { assignedUserId: string | null } | null }): string | null {
  if (t.lead?.assignedUserId) return t.lead.assignedUserId;
  return t.calendarKey?.startsWith("user:") ? t.calendarKey.slice(5) : null;
}

export const terminSelect = {
  id: true,
  customerId: true,
  startsAt: true,
  endsAt: true,
  calendarKey: true,
  attendance: true,
  lead: { select: { name: true, formData: true, contactOverrides: true, assignedUserId: true } },
} as const;

/** Pushes zum Terminbeginn und nach dem Termin (Cron alle 5 Minuten), je Termin höchstens einmal. */
export async function runTerminBeginn(now = new Date(), deps: { push?: PushFn } = {}): Promise<{ start: number; nachher: number }> {
  const push = deps.push ?? standardPush;
  const res = { start: 0, nachher: 0 };
  const beginn = await prisma.appointment.findMany({
    where: {
      status: "booked",
      mode: "video",
      startPushAt: null,
      attendance: null,
      startsAt: { lte: now, gt: new Date(now.getTime() - 15 * MIN) },
      customer: { dormantSince: null },
    },
    select: terminSelect,
    take: 100,
  });
  for (const t of beginn) {
    const claimed = await prisma.appointment.updateMany({ where: { id: t.id, startPushAt: null }, data: { startPushAt: now } });
    if (!claimed.count) continue;
    const name = leadLabel(kontaktFromLead(t.lead));
    await push(zustaendig(t), t.customerId, startPush({ appointmentId: t.id, name, startsAt: t.startsAt })).catch((e) => console.error("[termin-start push]", e));
    res.start++;
  }
  // „Fehlt noch“ und bis Terminende nichts mehr: Rückfrage „Ist … noch gekommen?“
  const offen = await prisma.appointment.findMany({
    where: {
      status: "booked",
      attendance: "fehlt",
      afterPushAt: null,
      startsAt: { lte: now, gt: new Date(now.getTime() - 24 * 60 * MIN) },
      customer: { dormantSince: null },
    },
    select: terminSelect,
    take: 100,
  });
  for (const t of offen) {
    if (terminEnde(t).getTime() > now.getTime()) continue;
    const claimed = await prisma.appointment.updateMany({ where: { id: t.id, afterPushAt: null, attendance: "fehlt" }, data: { afterPushAt: now } });
    if (!claimed.count) continue;
    const name = leadLabel(kontaktFromLead(t.lead));
    await push(zustaendig(t), t.customerId, nachherPush({ appointmentId: t.id, name })).catch((e) => console.error("[termin-nachher push]", e));
    res.nachher++;
  }
  return res;
}

export type WartetErgebnis = "gesendet" | "vorlage" | "nicht_moeglich";

/** WhatsApp „Herr Kannapinn wartet schon im Videoraum auf Sie: <Link>“ (nach „Fehlt noch“). */
export async function sendeWartetNachricht(appointmentId: string): Promise<WartetErgebnis> {
  const t = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, customerId: true, leadId: true, conversationId: true, meetUrl: true },
  });
  if (!t?.meetUrl || !t.conversationId) return "nicht_moeglich";
  const conv = await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactPhone: true, contactName: true, optedOutAt: true } });
  if (!conv?.contactPhone || conv.optedOutAt) return "nicht_moeglich";
  const [{ anspracheOf }, { ansprechpartner }, { vermittlerName }, { anredeZeile }, templates] = await Promise.all([
    import("@/lib/whatsapp/reminders"),
    import("@/lib/lead-anrede"),
    import("@/lib/whatsapp/gespraech"),
    import("@/lib/ansprache"),
    import("@/lib/whatsapp/templates"),
  ]);
  const an = await anspracheOf(t.customerId);
  const who = await ansprechpartner({ customerId: t.customerId, leadId: t.leadId, phone: conv.contactPhone, name: conv.contactName });
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  try {
    const r = await templates.sendWhatsAppNotice({
      customerId: t.customerId,
      to: conv.contactPhone,
      purpose: "appt_waiting",
      params: [templates.firstNameOf(conv.contactName), person.nom, t.meetUrl],
      text: wartetText({ an, hi: anredeZeile(an, who.kontakt), person, meetUrl: t.meetUrl }),
      leadId: t.leadId,
      contactName: conv.contactName,
      anrede: who.kontakt,
      // Vom Vermittler per Klick ausgelöst
      manuell: true,
    });
    return r.mode === "template" ? "vorlage" : "gesendet";
  } catch (err) {
    if (!(err instanceof templates.NoTemplateError)) console.error("[termin wartet]", err instanceof Error ? err.message : err);
    return "nicht_moeglich";
  }
}

export type AnwesenheitErgebnis = { ok: true; anwesenheit: Anwesenheit; wa?: WartetErgebnis } | { ok: false; error: string };

/**
 * „Ja, da“ / „Ist doch da“ / „Ja, gekommen“ → erschienen; „Fehlt noch“ → WhatsApp an den Lead (einmal). Prüft nur, dass
 * der Termin zum Kunden gehört (Schreibrecht prüft die Server-Aktion).
 */
export async function setzeAnwesenheit(
  appointmentId: string,
  antwort: "da" | "fehlt",
  opts: { customerId: string; userId?: string | null; now?: Date },
): Promise<AnwesenheitErgebnis> {
  const now = opts.now ?? new Date();
  const t = await prisma.appointment.findFirst({ where: { id: appointmentId, customerId: opts.customerId }, select: { id: true, leadId: true, status: true, attendance: true } });
  if (!t) return { ok: false, error: "Termin nicht gefunden." };
  if (t.status !== "booked" && t.status !== "completed") return { ok: false, error: "Der Termin ist nicht mehr gebucht." };
  const vorher = asAnwesenheit(t.attendance);
  if (antwort === "da") {
    await prisma.appointment.update({ where: { id: t.id }, data: { attendance: "erschienen", attendanceAt: now } });
    if (t.leadId && vorher !== "erschienen") await logLeadHistory(t.leadId, "status", "Termin: erschienen", { customerId: opts.customerId, userId: opts.userId ?? null });
    return { ok: true, anwesenheit: "erschienen" };
  }
  if (vorher === "fehlt") return { ok: true, anwesenheit: "fehlt" };
  const claimed = await prisma.appointment.updateMany({ where: { id: t.id, OR: [{ attendance: null }, { attendance: { not: "fehlt" } }] }, data: { attendance: "fehlt", attendanceAt: now } });
  if (!claimed.count) return { ok: true, anwesenheit: "fehlt" };
  const wa = await sendeWartetNachricht(t.id);
  if (t.leadId) {
    await logLeadHistory(
      t.leadId,
      "status",
      wa === "nicht_moeglich" ? "Termin: fehlt noch (WhatsApp nicht möglich, bitte anrufen)" : "Termin: fehlt noch, WhatsApp mit dem Link gesendet",
      { customerId: opts.customerId, userId: opts.userId ?? null },
    );
  }
  return { ok: true, anwesenheit: "fehlt", wa };
}
