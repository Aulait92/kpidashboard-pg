// „Ich bin abwesend“ (Urlaub, Krankheit, Sonstiges): Grundbausteine.
// Eine Abwesenheit gilt für ganze Tage in Berliner Zeit: startsAt = Beginn
// des ersten Tags, endsAt = Beginn des Tags NACH dem letzten Tag (exklusiv).
// Solange sie läuft, bekommt die Person keine neuen Leads und es werden keine
// Termine bei ihr gebucht (zusätzlich zu den Einträgen in ihrem Kalender).
//
// Diese Datei hat bewusst keine Abhängigkeit zu lib/calendar: der Kalender
// fragt hier nach „belegten“ Zeiten, der Ablauf (Speichern, Termine
// verschieben/übergeben) liegt in lib/absence-flow.ts.

import { prisma } from "@/lib/prisma";
import { userIdOfKey, type Busy } from "@/lib/calendar/tokens";

const TZ = "Europe/Berlin";
const DAY = 24 * 60 * 60 * 1000;

export const ABSENCE_KINDS = ["urlaub", "krank", "sonstiges"] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];
export const ABSENCE_KIND_LABEL: Record<AbsenceKind, string> = {
  urlaub: "Urlaub",
  krank: "Krank",
  sonstiges: "Sonstiges",
};
export const isAbsenceKind = (v: unknown): v is AbsenceKind => typeof v === "string" && (ABSENCE_KINDS as readonly string[]).includes(v);

export type AbsenceSpan = { startsAt: Date; endsAt: Date };

// ─── Datum (Berliner Zeit) ──────────────────────────────────────────────

/** Kalendertag in Berlin als YYYY-MM-DD. */
export function berlinYmd(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
}

/** Tagesbeginn (00:00 Berliner Zeit) eines YYYY-MM-DD als UTC-Zeitpunkt. */
export function berlinMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0);
  // Versatz Berlin ↔ UTC zu diesem Zeitpunkt (Sommer-/Winterzeit)
  const wall = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(wall.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asUtc - guess));
}

/** YYYY-MM-DD plus n Tage. */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Wochentag (0 = So … 6 = Sa) eines YYYY-MM-DD. */
export function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Von–bis (ganze Tage, inklusive) → Zeitspanne mit exklusivem Ende. */
export function absenceRange(fromYmd: string, toYmd: string): AbsenceSpan {
  return { startsAt: berlinMidnight(fromYmd), endsAt: berlinMidnight(addDaysYmd(toYmd, 1)) };
}

/** Erster Tag der Abwesenheit (YYYY-MM-DD). */
export const firstDayYmd = (a: { startsAt: Date }) => berlinYmd(a.startsAt);
/** Letzter Tag der Abwesenheit (YYYY-MM-DD, inklusive). */
export const lastDayYmd = (a: { endsAt: Date }) => berlinYmd(new Date(a.endsAt.getTime() - 1));

/** Erster Arbeitstag (Mo–Fr) nach der Abwesenheit. */
export function returnDayYmd(a: { endsAt: Date }): string {
  let ymd = berlinYmd(a.endsAt);
  while (weekdayOfYmd(ymd) === 0 || weekdayOfYmd(ymd) === 6) ymd = addDaysYmd(ymd, 1);
  return ymd;
}

/** „Fr., 22.11.“ */
export function fmtDayShort(ymd: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

/** „Freitag, 22. November“ */
export function fmtDayLong(ymd: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${ymd}T12:00:00Z`),
  );
}

/** Ganze Tage einer Abwesenheit (für den Hinweis „ab 7 Tagen Anzeigen pausieren“). */
export function absenceDays(a: AbsenceSpan): number {
  return Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / DAY);
}

/** Pause-Angebot für Einzel-Vertreter: ab 3 Tagen dezent, ab 7 Tagen hervorgehoben. */
export function pauseOfferLevel(days: number): "none" | "soft" | "strong" {
  return days >= 7 ? "strong" : days >= 3 ? "soft" : "none";
}

export const isActiveAt = (a: AbsenceSpan, t: Date) => a.startsAt.getTime() <= t.getTime() && t.getTime() < a.endsAt.getTime();

// ─── Belegte Zeiten ─────────────────────────────────────────────────────

/** Überlappende/angrenzende Zeitspannen zusammenfassen (sortiert). */
export function mergeSpans(spans: Busy[]): Busy[] {
  const sorted = [...spans].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Busy[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start.getTime() <= last.end.getTime()) {
      if (s.end.getTime() > last.end.getTime()) last.end = s.end;
    } else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/** Schnittmenge zweier sortierter, zusammengefasster Listen. */
function intersect(a: Busy[], b: Busy[]): Busy[] {
  const out: Busy[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start.getTime(), b[j].start.getTime());
    const end = Math.min(a[i].end.getTime(), b[j].end.getTime());
    if (start < end) out.push({ start: new Date(start), end: new Date(end) });
    if (a[i].end.getTime() < b[j].end.getTime()) i++;
    else j++;
  }
  return out;
}

/**
 * Zeiten, in denen ALLE genannten Personen abwesend sind. Ein Kalender, hinter
 * dem mehrere Personen stehen (z. B. zwei Inhaber-Logins am Agentur-Kalender),
 * ist erst gesperrt, wenn niemand von ihnen da ist.
 */
export function blockedSpans(personIds: string[], absences: Array<AbsenceSpan & { userId: string }>): Busy[] {
  if (personIds.length === 0) return [];
  let acc: Busy[] | null = null;
  for (const id of personIds) {
    const own = mergeSpans(absences.filter((a) => a.userId === id).map((a) => ({ start: a.startsAt, end: a.endsAt })));
    acc = acc === null ? own : intersect(acc, own);
    if (acc.length === 0) return [];
  }
  return acc ?? [];
}

/** Abwesenheiten, die [from, to) berühren (nicht vorzeitig beendete Reste). */
export async function absencesBetween(customerId: string, from: Date, to: Date) {
  return prisma.userAbsence.findMany({
    where: { customerId, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { id: true, userId: true, startsAt: true, endsAt: true, kind: true, substituteUserId: true },
    orderBy: { startsAt: "asc" },
  });
}

/** IDs aller Logins des Kunden, die jetzt abwesend sind. */
export async function absentUserIds(customerId: string, at = new Date()): Promise<Set<string>> {
  const rows = await prisma.userAbsence.findMany({
    where: { customerId, startsAt: { lte: at }, endsAt: { gt: at } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/** Inhaber-Logins (stehen hinter dem Agentur-Kalender). */
async function ownerIds(customerId: string): Promise<string[]> {
  const owners = await prisma.user.findMany({
    where: { customerId, role: "BUYER", NOT: { teamRole: "advisor" } },
    select: { id: true },
  });
  return owners.map((o) => o.id);
}

/**
 * Wer steht hinter einem Kalender-Schlüssel?
 * - user:<id> → dieser Berater
 * - Agentur-Kalender und Lead mit Zuständigem (ohne eigenen Kalender) → der Zuständige
 * - sonst → die Inhaber
 */
export async function keyPersons(customerId: string, key: string, assignedUserId: string | null): Promise<string[]> {
  const advisor = userIdOfKey(key);
  if (advisor) return [advisor];
  if (assignedUserId) return [assignedUserId];
  return ownerIds(customerId);
}

/**
 * Durch Abwesenheiten belegte Zeiten je Kalender-Schlüssel (gleiche
 * Reihenfolge wie `keys`) im Zeitraum [from, to).
 */
export async function absenceBusyForKeys(
  customerId: string,
  keys: string[],
  leadId: string | null | undefined,
  from: Date,
  to: Date,
): Promise<Busy[][]> {
  const absences = await absencesBetween(customerId, from, to);
  if (absences.length === 0) return keys.map(() => []);
  const assignedUserId = leadId
    ? ((await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedUserId: true } }))?.assignedUserId ?? null)
    : null;
  return Promise.all(keys.map(async (k) => blockedSpans(await keyPersons(customerId, k, assignedUserId), absences)));
}

/**
 * Wie viele Tage muss die Terminsuche länger laufen, damit nach einer
 * Abwesenheit noch genug Werktage übrig sind? Ein freier Kalender genügt,
 * deshalb zählt der am wenigsten gesperrte.
 */
export function extraSearchDays(blockedPerKey: Busy[][], from: Date, days: number): number {
  if (blockedPerKey.length === 0) return 0;
  const windowEnd = from.getTime() + days * DAY;
  let min = Infinity;
  for (const spans of blockedPerKey) {
    let ms = 0;
    for (const s of spans) {
      const a = Math.max(s.start.getTime(), from.getTime());
      const b = Math.min(s.end.getTime(), windowEnd);
      if (b > a) ms += b - a;
    }
    min = Math.min(min, ms);
  }
  return Math.min(60, Math.ceil(min / DAY));
}

/**
 * Sind gerade alle infrage kommenden Kalender wegen Abwesenheit gesperrt?
 * Dann: ab wann (erster Werktag danach) sind wieder Termine möglich.
 */
export function availableAgainYmd(blockedPerKey: Busy[][], now: Date): string | null {
  if (blockedPerKey.length === 0) return null;
  let earliest = Infinity;
  for (const spans of blockedPerKey) {
    const cur = spans.find((s) => s.start.getTime() <= now.getTime() && now.getTime() < s.end.getTime());
    if (!cur) return null; // dieser Kalender ist frei
    earliest = Math.min(earliest, cur.end.getTime());
  }
  return returnDayYmd({ endsAt: new Date(earliest) });
}

// ─── Anzeige ────────────────────────────────────────────────────────────

/** Aktuelle oder nächste Abwesenheit eines Logins. */
export async function currentOrNextAbsence(userId: string, now = new Date()) {
  return prisma.userAbsence.findFirst({
    where: { userId, endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    include: { substitute: { select: { id: true, displayName: true, email: true } } },
  });
}

/** Für die Oberfläche: nur Daten als YYYY-MM-DD, keine Uhrzeiten. */
export type AbsenceView = {
  id: string;
  userId: string;
  from: string;
  to: string;
  returnDay: string;
  kind: AbsenceKind;
  substituteUserId: string | null;
  substituteName: string | null;
  active: boolean;
};

export function toAbsenceView(
  a: { id: string; userId: string; startsAt: Date; endsAt: Date; kind: string; substituteUserId: string | null; substitute?: { displayName: string | null; email: string } | null },
  now = new Date(),
): AbsenceView {
  return {
    id: a.id,
    userId: a.userId,
    from: firstDayYmd(a),
    to: lastDayYmd(a),
    returnDay: returnDayYmd(a),
    kind: isAbsenceKind(a.kind) ? a.kind : "sonstiges",
    substituteUserId: a.substituteUserId,
    substituteName: a.substitute ? a.substitute.displayName?.trim() || a.substitute.email : null,
    active: isActiveAt(a, now),
  };
}

/** Laufende/kommende Abwesenheiten aller Logins eines Kunden (Team-Liste, Admin). */
export async function teamAbsences(customerId: string, now = new Date()): Promise<Map<string, AbsenceView>> {
  const rows = await prisma.userAbsence.findMany({
    where: { customerId, endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    include: { substitute: { select: { displayName: true, email: true } } },
  });
  const map = new Map<string, AbsenceView>();
  for (const r of rows) if (!map.has(r.userId)) map.set(r.userId, toAbsenceView(r, now));
  return map;
}
