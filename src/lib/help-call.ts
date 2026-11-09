// 15-Minuten-Hilfetermin für Kunden in der Einrichtung (z. B. Meta-Freigabe
// per Bildschirmfreigabe). Gebucht wird im Google-Kalender des Teams, der
// an einem internen Kundenkonto („performancegrowth Team“, plan=internal)
// hängt – so funktionieren die vorhandenen Kalender-Funktionen unverändert.
// Google verschickt die Einladung mit Meet-Link an den Kunden.

import { prisma } from "@/lib/prisma";
import { adapterFor, suggestSlots, type Slot } from "@/lib/calendar";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { logOfferActivity } from "@/lib/offer-links";

const TEAM_NAME = "performancegrowth Team";
const DURATION_MIN = 15;

export async function ensureTeamCustomer() {
  const existing = await prisma.customer.findFirst({ where: { plan: "internal" }, select: { id: true, name: true } });
  if (existing) return existing;
  return prisma.customer.create({ data: { name: TEAM_NAME, plan: "internal" }, select: { id: true, name: true } });
}

export async function teamCalendarStatus() {
  const team = await ensureTeamCustomer();
  const conn = await prisma.calendarConnection.findUnique({ where: { customerId: team.id }, select: { status: true, accountEmail: true } });
  return { teamId: team.id, connected: conn?.status === "connected", accountEmail: conn?.accountEmail ?? null };
}

/** Freie 15-Minuten-Slots der nächsten Werktage (9–17 Uhr). */
export async function helpCallSlots(): Promise<Slot[]> {
  const { teamId, connected } = await teamCalendarStatus();
  if (!connected) return [];
  return suggestSlots(teamId, DURATION_MIN, 12, [9, 10, 11, 12, 13, 14, 15, 16, 17], 8);
}

export type HelpCallResult = { ok: true; start: Date; url: string | null } | { ok: false; error: string };

export async function bookHelpCall(customerId: string, startIso: string, topic: string | null): Promise<HelpCallResult> {
  const { teamId, connected } = await teamCalendarStatus();
  if (!connected) return { ok: false, error: "Die Terminbuchung ist gerade nicht verfügbar. Bitte rufen Sie kurz an." };
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now() + 30 * 60 * 1000) {
    return { ok: false, error: "Bitte einen späteren Termin wählen." };
  }
  const end = new Date(start.getTime() + DURATION_MIN * 60 * 1000);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      name: true,
      users: { where: { role: "BUYER" }, select: { email: true } },
      onboarding: { select: { id: true, salesContactId: true, helpCallAt: true } },
    },
  });
  if (!customer) return { ok: false, error: "Kundenkonto nicht gefunden." };
  if (customer.onboarding?.helpCallAt && customer.onboarding.helpCallAt > new Date()) {
    return { ok: false, error: "Sie haben bereits einen Termin gebucht." };
  }
  const email = customer.users[0]?.email;
  if (!email) return { ok: false, error: "Für Ihr Konto ist keine E-Mail-Adresse hinterlegt." };

  try {
    const adapter = await adapterFor(teamId);
    const busy = await adapter.getBusy(start, end);
    if (busy.some((b) => b.start < end && b.end > start)) return { ok: false, error: "Dieser Termin ist gerade vergeben worden. Bitte einen anderen wählen." };
    const event = await adapter.createEvent({
      start,
      end,
      summary: `performancegrowth: Hilfe bei der Einrichtung (${customer.name})`,
      description: [
        "15 Minuten per Video mit Bildschirmfreigabe, z. B. für die Freigabe Ihres Meta-Werbekontos.",
        topic ? `Thema: ${topic}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      attendeeEmails: [email],
      video: true,
      location: null,
    });
    if (customer.onboarding) {
      await prisma.onboarding.update({
        where: { id: customer.onboarding.id },
        data: { helpCallAt: start, helpCallEventId: event.eventId, helpCallUrl: event.videoUrl ?? null },
      });
    }
    const when = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(start);
    const contactId = customer.onboarding?.salesContactId ?? null;
    if (contactId) await logOfferActivity({ dealId: null, salesContactId: contactId }, `Hilfetermin gebucht: ${when} Uhr`, topic);
    await sendToAdmins({
      title: `🛟 Hilfetermin: ${customer.name}`,
      body: `${when} Uhr${topic ? ` · ${topic}` : ""}`,
      url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb",
    }).catch(() => {});
    return { ok: true, start, url: event.videoUrl ?? null };
  } catch (err) {
    reportError(err, "help-call-book", { customer: customerId });
    return { ok: false, error: "Das hat nicht geklappt. Bitte versuchen Sie es noch einmal oder rufen Sie kurz an." };
  }
}
