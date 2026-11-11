// „Mein Kalender“: ein Kalender je Person.
// Inhaber = Kalender des Kundenkontos (CalendarConnection, Schlüssel = customerId),
// Berater = eigener Kalender (AdvisorCalendar, Schlüssel user:<id>).
// Die Agentur ist frei, wenn mindestens eine Person frei ist (bookingKeys/suggestSlots).

import { prisma } from "@/lib/prisma";
import { getAppUrl, sendPlainMail } from "@/lib/email";
import { PROVIDER_LABELS } from "@/lib/calendar";

export type TeamCalendarRow = {
  userId: string;
  name: string;
  email: string;
  owner: boolean;
  receivesLeads: boolean;
  connected: boolean;
  provider: string | null;
  /** Letzte Erinnerung (für die Anzeige „erinnert am …“). */
  remindedAt: Date | null;
};

export const REMIND_EVERY_MS = 24 * 3600_000;

/** Team-Übersicht: Inhaber mit dem Kalender des Kundenkontos, Berater mit ihrem eigenen. */
export async function loadTeamCalendars(customerId: string): Promise<{ rows: TeamCalendarRow[]; anyConnected: boolean }> {
  const [users, main, reminders] = await Promise.all([
    prisma.user.findMany({
      where: { customerId, role: "BUYER" },
      orderBy: [{ teamRole: "desc" }, { createdAt: "asc" }],
      select: { id: true, email: true, displayName: true, teamRole: true, receivesLeads: true, advisorCalendar: { select: { status: true, provider: true } } },
    }),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true, provider: true } }),
    prisma.auditLog.findMany({
      where: { customerId, action: "calendar.remind", at: { gte: new Date(Date.now() - 30 * 86400_000) } },
      orderBy: { at: "desc" },
      select: { entityId: true, at: true },
    }),
  ]);
  const mainOk = main?.status === "connected";
  const rows = users.map((u) => {
    const owner = u.teamRole !== "advisor";
    const own = u.advisorCalendar?.status === "connected";
    const connected = owner ? mainOk || own : own;
    const provider = owner ? (mainOk ? main!.provider : own ? u.advisorCalendar!.provider : null) : own ? u.advisorCalendar!.provider : null;
    return {
      userId: u.id,
      name: u.displayName ?? u.email,
      email: u.email,
      owner,
      receivesLeads: u.receivesLeads,
      connected,
      provider,
      remindedAt: reminders.find((r) => r.entityId === u.id)?.at ?? null,
    };
  });
  return { rows, anyConnected: mainOk || rows.some((r) => r.connected) };
}

export type RemindResult = { ok: true } | { ok: false; error: string };

/** Berater per E-Mail bitten, seinen Kalender zu verbinden (höchstens 1× pro Tag). */
export async function remindAdvisorCalendar(opts: {
  customerId: string;
  targetUserId: string;
  actor: { id: string | null; email: string | null };
  now?: Date;
  send?: typeof sendPlainMail;
}): Promise<RemindResult> {
  const now = opts.now ?? new Date();
  const target = await prisma.user.findFirst({
    where: { id: opts.targetUserId, customerId: opts.customerId, role: "BUYER" },
    select: { id: true, email: true, displayName: true, teamRole: true, advisorCalendar: { select: { status: true } }, customer: { select: { name: true } } },
  });
  if (!target || target.teamRole !== "advisor") return { ok: false, error: "Berater nicht gefunden." };
  if (target.advisorCalendar?.status === "connected") return { ok: false, error: "Der Kalender ist schon verbunden." };
  const recent = await prisma.auditLog.findFirst({
    where: { customerId: opts.customerId, action: "calendar.remind", entityId: target.id, at: { gt: new Date(now.getTime() - REMIND_EVERY_MS) } },
    select: { id: true },
  });
  if (recent) return { ok: false, error: "Heute schon erinnert. Morgen geht es wieder." };

  let url = "/buyer/kalender";
  try {
    url = `${getAppUrl()}/buyer/kalender`;
  } catch {
    // ohne APP_URL relativer Link
  }
  const hello = target.displayName ? `Hallo ${target.displayName.split(/\s+/)[0]},` : "Hallo,";
  const res = await (opts.send ?? sendPlainMail)({
    to: target.email,
    subject: "Bitte Kalender verbinden, damit Leads Termine bei Ihnen buchen können",
    text: [
      hello,
      "",
      `damit Leads von ${target.customer?.name ?? "Ihrer Agentur"} Termine direkt bei Ihnen buchen können, verbinden Sie bitte einmal Ihren Kalender (Google oder Outlook). Das dauert eine Minute.`,
      "",
      `Hier geht es los: ${url}`,
      "",
      "Termine landen dann nur in Ihren freien Zeiten direkt in Ihrem Kalender.",
      "",
      "Viele Grüße",
      "performancegrowth",
    ].join("\n"),
  });
  if (!res.ok) return { ok: false, error: "E-Mail konnte nicht gesendet werden. Bitte später noch einmal versuchen." };
  await prisma.auditLog.create({
    data: { action: "calendar.remind", entity: "User", entityId: target.id, customerId: opts.customerId, actorId: opts.actor.id, actorEmail: opts.actor.email, actorRole: "BUYER", at: now },
  });
  return { ok: true };
}

export type AdoptResult = { ok: true } | { ok: false; error: string };

/**
 * Früher verbundenen „eigenen Kalender“ eines Inhabers als seinen Kalender
 * (Kalender des Kundenkontos) übernehmen: Zugangsdaten wandern von
 * AdvisorCalendar nach CalendarConnection, der eigene wird gelöscht.
 * Nur wenn das Kundenkonto noch keinen verbundenen Kalender hat.
 */
export async function adoptOwnCalendar(customerId: string, userId: string): Promise<AdoptResult> {
  return prisma.$transaction(async (tx) => {
    const own = await tx.advisorCalendar.findUnique({ where: { userId } });
    if (!own || own.customerId !== customerId || own.status !== "connected") return { ok: false as const, error: "Kein eigener Kalender verbunden." };
    const main = await tx.calendarConnection.findUnique({ where: { customerId }, select: { status: true } });
    if (main?.status === "connected") return { ok: false as const, error: "Es ist schon ein Kalender verbunden." };
    const data = {
      provider: own.provider,
      accountEmail: own.accountEmail,
      calendarId: own.calendarId,
      accessTokenEnc: own.accessTokenEnc,
      refreshTokenEnc: own.refreshTokenEnc,
      tokenExpiresAt: own.tokenExpiresAt,
      scope: own.scope,
      status: "connected",
    };
    // Buchungslink (bookingSlug) eines früheren Kalenders bleibt erhalten.
    await tx.calendarConnection.upsert({ where: { customerId }, create: { customerId, ...data }, update: data });
    await tx.advisorCalendar.delete({ where: { userId } });
    return { ok: true as const };
  });
}

export function providerLabel(p: string | null | undefined): string {
  return (p && PROVIDER_LABELS[p]) || "Kalender";
}
