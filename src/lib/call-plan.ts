// Anrufplan bei „nicht erreicht“ (Ole, 14.11.2026): 6 Versuche über mindestens 3 Tage zu verschiedenen
// Tageszeiten. Viele Leads erreicht man erst beim 4. bis 6. Versuch.
//   Tag 1: sofort, nach 2 Stunden, abends
//   Tag 2: vormittags
//   Tag 4: nachmittags
//   Tag 6: abends
// Der nächste Versuch steht als Wiedervorlage („Anrufversuch X von 6“) auf „Heute“. Dazwischen schickt die
// Nicht-erreicht-Abfolge (lib/lead-sequences.ts) automatisch WhatsApp, sofern beim Kunden eingeschaltet.
// Rein (auch im Browser nutzbar); Zählen und Planen in der Datenbank: lib/call-attempts.ts.

import { CALL_ATTEMPTS_TARGET } from "@/lib/lead-lost";
import { NEXT_STEP_TASK_NOTE } from "@/lib/lead-next-step";

export { CALL_ATTEMPTS_TARGET };

/** Ein Anrufversuch zählt je 30 Minuten nur einmal. */
export const CALL_ATTEMPT_LOCK_MS = 30 * 60 * 1000;

const HOUR = 60 * 60 * 1000;
const TZ = "Europe/Berlin";
const PLAN_PREFIX = "Anrufversuch ";

/** Notiz der Wiedervorlage für den nächsten Versuch. */
export function callPlanNote(attempt: number): string {
  return `${PLAN_PREFIX}${attempt} von ${CALL_ATTEMPTS_TARGET}`;
}

/** Aufgaben, die der Plan ersetzen darf (eigene und die Anruf-Schritte der alten Nicht-erreicht-Abfolge). */
const REPLACEABLE = new Set(["Nicht erreicht: nochmal anrufen", "Nachfassen: nochmal anrufen", "Letzter Versuch: anrufen", NEXT_STEP_TASK_NOTE]);

export function isCallPlanNote(note: string | null | undefined): boolean {
  return !!note && note.startsWith(PLAN_PREFIX) && note.includes(` von ${CALL_ATTEMPTS_TARGET}`);
}

export function isReplaceableCallTask(note: string | null | undefined): boolean {
  return isCallPlanNote(note) || (!!note && REPLACEABLE.has(note));
}

type Slot = { afterHours: number } | { day: number; hour: number; minute: number };

/** Plan je Versuch (Index = Nummer des Versuchs). Versuch 1 ist der erste Anruf („sofort“). */
const SLOTS: Record<number, Slot> = {
  2: { afterHours: 2 },
  3: { day: 0, hour: 18, minute: 30 },
  4: { day: 1, hour: 10, minute: 0 },
  5: { day: 3, hour: 15, minute: 0 },
  6: { day: 5, hour: 18, minute: 30 },
};

/** Früheste und späteste Uhrzeit für einen Anruf (Berlin). */
const EARLIEST = { hour: 9, minute: 0 };
const LATEST_HOUR = 20;
/** Mindestabstand zwischen zwei Versuchen. */
const MIN_GAP_MS = HOUR;

function berlinParts(d: Date) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), hour: Number(get("hour")), minute: Number(get("minute")), weekday: get("weekday") };
}

/** Wanduhrzeit in Berlin → Zeitpunkt. */
export function berlinWallTime(y: number, m: number, d: number, hour: number, minute: number): Date {
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const p = berlinParts(new Date(guess));
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute);
  return new Date(guess - (asUtc - guess));
}

/** Gleiche Uhrzeit (Berlin), n Kalendertage später. */
function plusDaysAt(base: Date, days: number, hour: number, minute: number): Date {
  const p = berlinParts(base);
  const mid = new Date(Date.UTC(p.y, p.m - 1, p.d + days, 12));
  return berlinWallTime(mid.getUTCFullYear(), mid.getUTCMonth() + 1, mid.getUTCDate(), hour, minute);
}

/** In ein Anruffenster schieben: nicht vor 9 Uhr, nicht ab 20 Uhr, nicht sonntags. */
function intoWindow(at: Date): Date {
  let t = at;
  for (let i = 0; i < 4; i++) {
    const p = berlinParts(t);
    if (p.hour >= LATEST_HOUR) t = plusDaysAt(t, 1, EARLIEST.hour, EARLIEST.minute);
    else if (p.hour < EARLIEST.hour) t = plusDaysAt(t, 0, EARLIEST.hour, EARLIEST.minute);
    else if (p.weekday === "Sun") t = plusDaysAt(t, 1, p.hour, p.minute);
    else return t;
  }
  return t;
}

/**
 * Zeitpunkt des nächsten Versuchs nach `done` dokumentierten Versuchen, oder null, wenn alle 6 gemacht sind.
 * startedAt = erster Versuch (Tag 1), lastAt = letzter Versuch.
 */
export function nextCallAttemptAt(opts: { done: number; startedAt: Date; lastAt: Date; now: Date }): Date | null {
  const next = Math.max(1, opts.done) + 1;
  if (next > CALL_ATTEMPTS_TARGET) return null;
  const slot = SLOTS[next];
  let at = "afterHours" in slot ? new Date(opts.lastAt.getTime() + slot.afterHours * HOUR) : plusDaysAt(opts.startedAt, slot.day, slot.hour, slot.minute);
  const earliest = Math.max(opts.lastAt.getTime() + MIN_GAP_MS, opts.now.getTime());
  if (at.getTime() < earliest) at = new Date(earliest);
  return intoWindow(at);
}

/** Kurz für die Anzeige: „heute 14:30“, „morgen 10:00“, „Do., 19.11. 15:00“. */
export function fmtAttemptAt(at: Date, now: Date): string {
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(at);
  if (ymd(at) === ymd(now)) return `heute ${time} Uhr`;
  if (ymd(at) === ymd(new Date(now.getTime() + 24 * HOUR))) return `morgen ${time} Uhr`;
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(at);
  return `${day} ${time} Uhr`;
}

/** „heute um 18:30 Uhr“, „morgen um 10 Uhr“, „am Donnerstag um 15 Uhr“ (für Texte an den Lead, rein). */
export function zeitImSatz(at: Date, now: Date): string {
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const p = berlinParts(at);
  const zeit = p.minute ? `${p.hour}:${String(p.minute).padStart(2, "0")} Uhr` : `${p.hour} Uhr`;
  if (ymd(at) === ymd(now)) return `heute um ${zeit}`;
  if (ymd(at) === ymd(plusDaysAt(now, 1, 12, 0))) return `morgen um ${zeit}`;
  const tag = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long" }).format(at);
  return `am ${tag} um ${zeit}`;
}

/**
 * Zwei Rückrufzeiten für die Mail „Nicht erreicht“ aus dem Anrufplan (Paket M4): der geplante nächste Versuch und der
 * danach. null, wenn kein Plan läuft oder danach kein Versuch mehr kommt (dann gelten die Standardzeiten).
 */
export function rueckrufZeitenAusPlan(
  l: { followUpAt: Date | null; followUpNote: string | null; callAttempts: number; callPlanStartedAt: Date | null; lastCallAttemptAt: Date | null },
  now: Date,
): [string, string] | null {
  if (!l.followUpAt || !isCallPlanNote(l.followUpNote)) return null;
  const n = Number(/(\d+) von/.exec(l.followUpNote ?? "")?.[1] ?? l.callAttempts + 1);
  const erst = l.followUpAt.getTime() < now.getTime() ? now : l.followUpAt;
  const zweit = nextCallAttemptAt({ done: n, startedAt: l.callPlanStartedAt ?? l.lastCallAttemptAt ?? erst, lastAt: erst, now: erst });
  if (!zweit) return null;
  return [zeitImSatz(erst, now), zeitImSatz(zweit, now)];
}
