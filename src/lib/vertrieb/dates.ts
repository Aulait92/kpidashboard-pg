const TZ = "Europe/Berlin";

/** YYYY-MM-DD in deutscher Zeit */
export function dayKey(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: TZ });
}

/** Datum aus <input type="date"> → 09:00 Uhr an dem Tag (deutsche Zeit, grob) */
export function fromDayKey(key: string, time = "09:00"): Date {
  // Offset für den Tag bestimmen (Sommer-/Winterzeit)
  const probe = new Date(`${key}T12:00:00Z`);
  const berlinNoon = new Date(probe.toLocaleString("en-US", { timeZone: TZ }));
  const utcNoon = new Date(probe.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMin = (berlinNoon.getTime() - utcNoon.getTime()) / 60000;
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10), h, m) - offsetMin * 60000);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** n Werktage (Mo–Fr) weiter */
export function addWorkdays(d: Date, n: number): Date {
  let r = new Date(d);
  let left = n;
  while (left > 0) {
    r = addDays(r, 1);
    const wd = new Date(r.toLocaleString("en-US", { timeZone: TZ })).getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return r;
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return "–";
  return d.toLocaleDateString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "–";
  return d.toLocaleString("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function relDay(d: Date): string {
  const diff = Math.round((fromDayKey(dayKey(d)).getTime() - fromDayKey(todayKey()).getTime()) / 86400000);
  if (diff === 0) return "heute";
  if (diff === 1) return "morgen";
  if (diff === -1) return "gestern";
  if (diff < 0) return `vor ${-diff} Tagen`;
  return `in ${diff} Tagen`;
}

/** Uhrzeit HH:MM in deutscher Zeit */
export function timeKey(d: Date): string {
  return d.toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
}
