// Zeiträume in Berliner Zeit: Woche Mo 00:00 bis Mo 00:00, Kalendermonat.

const TZ = "Europe/Berlin";

function berlinParts(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd: p.weekday as string };
}

/** Mitternacht (Berlin) des Kalendertags y-m-d als UTC-Zeitpunkt. */
export function berlinMidnight(y: number, m: number, d: number): Date {
  const guess = new Date(Date.UTC(y, m - 1, d));
  const berlin = new Date(guess.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (berlin.getTime() - utc.getTime()));
}

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Beginn der Woche (Montag 00:00 Berlin), offset 1 = nächste Woche. */
export function weekStart(now = new Date(), offset = 0): Date {
  const { y, m, d, wd } = berlinParts(now);
  const back = WD.indexOf(wd);
  const local = new Date(Date.UTC(y, m - 1, d - back + offset * 7));
  return berlinMidnight(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate());
}

export function weekRange(now = new Date(), offset = 0) {
  return { start: weekStart(now, offset), end: weekStart(now, offset + 1) };
}

export function monthRange(now = new Date()) {
  const { y, m } = berlinParts(now);
  return { start: berlinMidnight(y, m, 1), end: m === 12 ? berlinMidnight(y + 1, 1, 1) : berlinMidnight(y, m + 1, 1) };
}

export const fmtDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
export const fmtWeek = (start: Date) => `${fmtDay(start)}–${fmtDay(new Date(start.getTime() + 6 * 86_400_000))}`;
