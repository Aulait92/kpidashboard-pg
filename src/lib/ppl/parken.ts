// Frist für geparkte Pay-per-Lead-Leads (Ole, 20.11.2026): Ein geparkter Lead (kein freies Kontingent) wird nur
// innerhalb von PPL_PARK_MAX_HOURS (Standard 48 h) ab Eingang neu verteilt bzw. ausgeliefert. Danach verfällt er
// (Status „expired“), wird nie wieder verkauft und seine Kontaktdaten werden entfernt (engine.ts expireParked).
// Reine Helfer ohne Datenbank (getestet).

const HOUR = 3_600_000;
export const DEFAULT_PARK_MAX_HOURS = 48;

/** Endstatus verfallener geparkter Leads. */
export const EXPIRED_STATUS = "expired";

/** Frist in Stunden (Env PPL_PARK_MAX_HOURS, sonst 48). */
export function parkMaxHours(env: string | undefined = process.env.PPL_PARK_MAX_HOURS): number {
  const n = Number(env);
  return env?.trim() && Number.isFinite(n) && n > 0 ? n : DEFAULT_PARK_MAX_HOURS;
}

/** Zeitpunkt, ab dem ein geparkter Lead verfällt. */
export function parkDeadline(createdAt: Date, hours = parkMaxHours()): Date {
  return new Date(createdAt.getTime() + hours * HOUR);
}

/** Frühester Eingangszeitpunkt, der noch verteilt werden darf. */
export function parkCutoff(now: Date, hours = parkMaxHours()): Date {
  return new Date(now.getTime() - hours * HOUR);
}

/** Frist abgelaufen (ab genau der Frist gilt der Lead als verfallen). */
export function parkExpired(createdAt: Date, now = new Date(), hours = parkMaxHours()): boolean {
  return now.getTime() >= parkDeadline(createdAt, hours).getTime();
}

/** Grund im Verlauf eines verfallenen Leads (auch Kategorie in den Auswertungen). */
export function expiredReason(hours = parkMaxHours()): string {
  return `verworfen (geparkt > ${hours} h)`;
}

const fmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Hinweis beim Parken: „wird am 22.11., 14:05 verworfen, wenn kein Bezug frei wird“. */
export function parkDeadlineHint(createdAt: Date, hours = parkMaxHours()): string {
  return `wird am ${fmt.format(parkDeadline(createdAt, hours)).replace(", ", " um ")} Uhr verworfen, wenn kein Bezug frei wird`;
}
