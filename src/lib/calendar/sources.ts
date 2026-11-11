// Verfügbarkeits-Quellen eines Kunden einrichten (Kundenbereich und Admin):
//   A) ICS-Link des Firmenkalenders, B) Allianz-Online-Kalender,
//   C) immer: feste Lead-Zeiten + „Zeit blockieren".
// Die Server-Actions prüfen die Rechte und rufen nur diese Funktionen auf.

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { fetchIcsBusy } from "@/lib/calendar/ics";
import {
  AllianzCalendarError,
  changeAllianzTemplate,
  decodeAllianzCalendar,
  encodeAllianzCalendar,
  fetchFreeSlots,
  resolveAllianzCalendar,
  type AllianzCalendar,
} from "@/lib/calendar/allianz-online";
import { blockRange, leadTimesError, normalizeLeadTimes, normalizeTime, saveLeadTimes, type LeadTimes } from "@/lib/calendar/lead-times";

export type SourceResult = { ok?: boolean; error?: string; info?: string };

const DAY = 24 * 60 * 60 * 1000;

/** Übersicht für die Oberflächen (ohne Geheimnisse: kein ICS-Link, keine IDs). */
export type AllianzSummary = {
  vtnr: string;
  orgName: string;
  templateId: string;
  templateName: string;
  durationMin: number;
  templates: { id: string; name: string; durationMin: number }[];
  resources: { id: string; name: string }[];
  resourceId: string | null;
  bookingDayEarliest: number;
  consentAt: Date | null;
  lastOkAt: Date | null;
  lastError: string | null;
};

export async function loadSources(customerId: string): Promise<{ hasIcs: boolean; allianz: AllianzSummary | null; bookingCalendar: boolean }> {
  const [agent, conn] = await Promise.all([
    prisma.agentConfig.findUnique({
      where: { customerId },
      select: { availabilityIcsUrlEnc: true, allianzCalendarEnc: true, allianzConsentAt: true, allianzLastOkAt: true, allianzLastError: true },
    }),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } }),
  ]);
  const cal = decodeAllianzCalendar(agent?.allianzCalendarEnc);
  return {
    hasIcs: !!agent?.availabilityIcsUrlEnc,
    bookingCalendar: conn?.status === "connected",
    allianz: cal
      ? {
          vtnr: cal.vtnr,
          orgName: cal.orgName,
          templateId: cal.templateId,
          templateName: cal.templateName,
          durationMin: cal.durationMin,
          templates: cal.templates,
          resources: cal.resources,
          resourceId: cal.resourceId,
          bookingDayEarliest: cal.bookingDayEarliest,
          consentAt: agent?.allianzConsentAt ?? null,
          lastOkAt: agent?.allianzLastOkAt ?? null,
          lastError: agent?.allianzLastError ?? null,
        }
      : null,
  };
}

/** Prüfabruf: freie Termine der nächsten 30 Tage (wirft bei Fehler). */
async function probe(cal: AllianzCalendar): Promise<{ count: number; first: string | null }> {
  const now = new Date();
  const slots = await fetchFreeSlots(cal, now, new Date(now.getTime() + 30 * DAY));
  return { count: slots.length, first: slots.sort()[0] ?? null };
}

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** B) Allianz-Online-Kalender verbinden (Link oder VTNR, Zustimmung nötig). */
export async function connectAllianz(customerId: string, input: string, consent: boolean): Promise<SourceResult> {
  if (!consent) return { error: "Bitte stimmen Sie zu, dass wir Ihre freien Termine abrufen dürfen." };
  if (!input.trim()) return { error: "Bitte den Link Ihrer Vertreter-Seite oder Ihre Vertreternummer eingeben." };
  let cal: AllianzCalendar;
  let check: { count: number; first: string | null };
  try {
    cal = await resolveAllianzCalendar(input);
    check = await probe(cal);
  } catch (err) {
    return { error: err instanceof AllianzCalendarError ? err.message : "Das hat nicht geklappt. Bitte später noch einmal versuchen." };
  }
  await prisma.agentConfig.upsert({
    where: { customerId },
    create: { customerId, allianzCalendarEnc: encodeAllianzCalendar(cal), allianzConsentAt: new Date(), allianzLastOkAt: new Date() },
    update: { allianzCalendarEnc: encodeAllianzCalendar(cal), allianzConsentAt: new Date(), allianzLastOkAt: new Date(), allianzLastError: null, allianzAlertAt: null },
  });
  const who = cal.orgName ? `${cal.orgName}, ` : "";
  return {
    ok: true,
    info: check.first
      ? `Verbunden: ${who}Termin-Art „${cal.templateName}“. Nächster freier Termin: ${fmtDay(check.first)} Uhr.`
      : `Verbunden: ${who}Termin-Art „${cal.templateName}“. In den nächsten 30 Tagen sind dort gerade keine Termine frei.`,
  };
}

/** Termin-Art bzw. Person wechseln (Admin). */
export async function changeAllianz(customerId: string, templateId: string, resourceId: string | null): Promise<SourceResult> {
  const agent = await prisma.agentConfig.findUnique({ where: { customerId }, select: { allianzCalendarEnc: true } });
  const cal = decodeAllianzCalendar(agent?.allianzCalendarEnc);
  if (!cal) return { error: "Kein Allianz-Online-Kalender verbunden." };
  try {
    const next = await changeAllianzTemplate(cal, templateId, resourceId);
    await probe(next);
    await prisma.agentConfig.update({ where: { customerId }, data: { allianzCalendarEnc: encodeAllianzCalendar(next), allianzLastOkAt: new Date(), allianzLastError: null } });
    return { ok: true, info: `Termin-Art: ${next.templateName} (${next.durationMin} Min.).` };
  } catch (err) {
    return { error: err instanceof AllianzCalendarError ? err.message : "Das hat nicht geklappt." };
  }
}

export async function disconnectAllianz(customerId: string): Promise<void> {
  await prisma.agentConfig.updateMany({
    where: { customerId },
    data: { allianzCalendarEnc: null, allianzConsentAt: null, allianzLastOkAt: null, allianzLastError: null, allianzAlertAt: null },
  });
}

/** A) ICS-Link speichern (vorher einmal abrufen). */
export async function saveIcsLink(customerId: string, raw: string): Promise<SourceResult> {
  const url = raw.trim();
  if (!/^(https|webcal):\/\/\S+$/i.test(url)) return { error: "Bitte den vollständigen Link (beginnt mit https:// oder webcal://) einfügen." };
  try {
    const now = new Date();
    await fetchIcsBusy(url, now, new Date(now.getTime() + 14 * DAY));
  } catch {
    return { error: "Unter diesem Link finden wir keinen Kalender. Bitte den ICS-Link (nicht den HTML-Link) kopieren." };
  }
  await prisma.agentConfig.upsert({
    where: { customerId },
    create: { customerId, availabilityIcsUrlEnc: encryptSecret(url) },
    update: { availabilityIcsUrlEnc: encryptSecret(url) },
  });
  return { ok: true, info: "Kalender-Link gespeichert. Belegte Zeiten daraus berücksichtigen wir ab sofort." };
}

export async function removeIcsLink(customerId: string): Promise<void> {
  await prisma.agentConfig.updateMany({ where: { customerId }, data: { availabilityIcsUrlEnc: null } });
}

/** C) Lead-Zeiten aus Formularfeldern day_<0-6>, time_<HH:MM>, extraTime. */
export function leadTimesFromForm(fd: FormData): LeadTimes {
  const weekdays: number[] = [];
  const times: string[] = [];
  for (const [k, v] of fd.entries()) {
    if (v !== "on") continue;
    if (k.startsWith("day_")) weekdays.push(Number(k.slice(4)));
    if (k.startsWith("time_")) times.push(k.slice(5));
  }
  const extra = String(fd.get("extraTime") ?? "").trim();
  if (extra) times.push(extra);
  return normalizeLeadTimes({ weekdays, times });
}

export async function updateLeadTimes(customerId: string, calendarKey: string, fd: FormData): Promise<SourceResult> {
  const extra = String(fd.get("extraTime") ?? "").trim();
  if (extra && !normalizeTime(extra)) return { error: "Die zusätzliche Uhrzeit bitte als HH:MM angeben (z. B. 17:30)." };
  const lt = leadTimesFromForm(fd);
  const err = leadTimesError(lt);
  if (err) return { error: err };
  await saveLeadTimes(customerId, calendarKey, lt);
  return { ok: true, info: "Gespeichert." };
}

/** „Zeit blockieren": Datum + von–bis. */
export async function addBlock(customerId: string, calendarKey: string, fd: FormData): Promise<SourceResult> {
  const range = blockRange(String(fd.get("date") ?? ""), String(fd.get("from") ?? ""), String(fd.get("to") ?? ""));
  if ("error" in range) return { error: range.error };
  if (range.endsAt.getTime() < Date.now()) return { error: "Dieser Zeitraum liegt in der Vergangenheit." };
  const note = String(fd.get("note") ?? "").trim().slice(0, 120) || null;
  await prisma.calendarBlock.create({ data: { customerId, calendarKey, startsAt: range.startsAt, endsAt: range.endsAt, note } });
  return { ok: true, info: "Zeit blockiert." };
}

export async function deleteBlock(customerId: string, id: string): Promise<void> {
  await prisma.calendarBlock.deleteMany({ where: { id, customerId } });
}

/** Kommende Blöcke eines Kalenders (für die Liste). */
export async function upcomingBlocks(calendarKey: string) {
  return prisma.calendarBlock.findMany({
    where: { calendarKey, endsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 50,
    select: { id: true, startsAt: true, endsAt: true, note: true },
  });
}
