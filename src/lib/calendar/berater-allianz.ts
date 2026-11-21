// Berater-App-Kalender mit Allianz-Person (Ole, 21.11.2026): Team-Mitglieder einer Allianz-Agentur bekommen ihre
// Termine in ihren eigenen Allianz-Outlook-Kalender, ohne Doppelbuchungen. Google/Microsoft-Anbindung ist bei der
// Allianz gesperrt (Microsoft 365 und Kalenderfreigabe). Lösung: AdvisorCalendar mit provider „app“ und der Person
// (bookingtime-Ressource) aus dem Allianz-Online-Kalender der Agentur.
// - Belegt = eigene Termine der App + alles, was im Allianz-Online-Kalender für diese Person nicht frei ist
//   (lib/calendar/index.ts adapterFor). Vor dem frühesten Allianz-Buchungstag: keine Termine (wie beim App-Kalender der Agentur).
// - Termine gehen als Kalendereinladung an die Adresse des Beraters (accountEmail, Standard: Login-Adresse).
// - status „connected“ erst mit gewählter Person: damit zählt der Kalender für bookingKeys und team-bereit.

import { prisma } from "@/lib/prisma";
import { APP_PROVIDER } from "@/lib/calendar/app-kalender";
import { decodeAllianzCalendar, type AllianzCalendar, type AllianzResource } from "@/lib/calendar/allianz-online";
import type { SourceResult } from "@/lib/calendar/sources";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Allianz-Kalender der Agentur, eingeschränkt auf die Person des Beraters (rein, getestet). Die freien Slots je Monat
 * teilen sich Agentur und Berater (Zwischenspeicher je Organisation und Termin-Art); gefiltert wird erst danach je
 * Person (fetchFreeSlots). null, wenn die Person in der gewählten Termin-Art nicht (mehr) vorkommt.
 */
export function allianzFuerBerater(cal: AllianzCalendar, resourceId: string | null | undefined): AllianzCalendar | null {
  if (!resourceId || !cal.resources.some((r) => r.id === resourceId)) return null;
  return { ...cal, resourceId };
}

/** Allianz-Online-Kalender der Agentur (nur mit Zustimmung), sonst null. */
export async function agenturAllianz(customerId: string): Promise<AllianzCalendar | null> {
  const a = await prisma.agentConfig.findUnique({ where: { customerId }, select: { allianzCalendarEnc: true, allianzConsentAt: true } });
  return a?.allianzConsentAt ? decodeAllianzCalendar(a.allianzCalendarEnc) : null;
}

export type BeraterPersonen = {
  /** Personen der gewählten Termin-Art im Allianz-Online-Kalender der Agentur */
  resources: AllianzResource[];
  /** userId → gewählte Person (nur Berater mit App-Kalender) */
  gewaehlt: Record<string, { resourceId: string | null; email: string | null; connected: boolean }>;
};

/** Für die Oberflächen: Personen der Agentur und wer welche gewählt hat; null ohne Allianz-Online-Kalender. */
export async function loadBeraterPersonen(customerId: string): Promise<BeraterPersonen | null> {
  const cal = await agenturAllianz(customerId);
  if (!cal) return null;
  const rows = await prisma.advisorCalendar.findMany({
    where: { customerId, provider: APP_PROVIDER },
    select: { userId: true, allianzResourceId: true, accountEmail: true, status: true },
  });
  return {
    resources: cal.resources,
    gewaehlt: Object.fromEntries(rows.map((r) => [r.userId, { resourceId: r.allianzResourceId, email: r.accountEmail, connected: r.status === "connected" }])),
  };
}

/**
 * Person im Allianz-Online-Kalender für ein Team-Mitglied setzen (Berater selbst, Inhaber oder Admin).
 * Leere Person = App-Kalender des Mitglieds entfernen. Ein verbundener Google-/Outlook-Kalender wird nie überschrieben.
 */
export async function beraterAllianzSetzen(opts: { customerId: string; userId: string; resourceId: string | null; email?: string | null }): Promise<SourceResult> {
  const user = await prisma.user.findFirst({
    where: { id: opts.userId, customerId: opts.customerId, role: "BUYER" },
    select: { id: true, email: true, displayName: true, advisorCalendar: { select: { provider: true, status: true } } },
  });
  if (!user) return { error: "Mitglied nicht gefunden." };
  const own = user.advisorCalendar;
  const fremd = own?.status === "connected" && own.provider !== APP_PROVIDER;

  if (!opts.resourceId) {
    if (own?.provider === APP_PROVIDER) await prisma.advisorCalendar.delete({ where: { userId: user.id } });
    return { ok: true, info: "Entfernt." };
  }
  if (fremd) return { error: "Hier ist schon Google oder Outlook verbunden. Bitte erst trennen." };

  const cal = await agenturAllianz(opts.customerId);
  if (!cal) return { error: "Ihre Agentur hat keinen Allianz-Online-Kalender verbunden." };
  const person = cal.resources.find((r) => r.id === opts.resourceId);
  if (!person) return { error: "Diese Person gibt es im Allianz-Online-Kalender nicht." };

  const vergeben = await prisma.advisorCalendar.findFirst({
    where: { customerId: opts.customerId, provider: APP_PROVIDER, allianzResourceId: person.id, userId: { not: user.id } },
    select: { user: { select: { displayName: true, email: true } } },
  });
  if (vergeben) return { error: `${person.name} ist schon ${vergeben.user.displayName ?? vergeben.user.email} zugeordnet.` };

  const email = (opts.email?.trim() || user.email).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Bitte eine gültige E-Mail-Adresse eingeben." };

  const data = {
    provider: APP_PROVIDER,
    status: "connected",
    allianzResourceId: person.id,
    accountEmail: email,
    accessTokenEnc: null,
    refreshTokenEnc: null,
    tokenExpiresAt: null,
    scope: null,
    calendarId: "primary",
  };
  await prisma.advisorCalendar.upsert({ where: { userId: user.id }, create: { userId: user.id, customerId: opts.customerId, ...data }, update: data });
  return { ok: true, info: `Termine bekommen Sie als Einladung an ${email}.` };
}

/**
 * Nach Verbinden, Wechsel der Termin-Art oder Trennen des Allianz-Online-Kalenders der Agentur: App-Kalender der
 * Berater sind nur verbunden, solange ihre Person dort vorkommt (sonst keine Quelle für belegte Zeiten, sie ruhen und
 * bekommen keine Leads). Kommt die Person wieder vor, sind sie wieder verbunden.
 */
export async function beraterAppKalenderPruefen(customerId: string): Promise<void> {
  const cal = await agenturAllianz(customerId);
  const ids = cal?.resources.map((r) => r.id) ?? [];
  await prisma.advisorCalendar.updateMany({
    where: { customerId, provider: APP_PROVIDER, status: "connected", OR: [{ allianzResourceId: null }, { allianzResourceId: { notIn: ids } }] },
    data: { status: "pending" },
  });
  if (ids.length) {
    await prisma.advisorCalendar.updateMany({
      where: { customerId, provider: APP_PROVIDER, status: { not: "connected" }, allianzResourceId: { in: ids } },
      data: { status: "connected" },
    });
  }
}
