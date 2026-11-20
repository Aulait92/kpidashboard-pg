// Löschfrist für verworfene Pay-per-Lead-Leads (Ole, 20.11.2026): Ungültige, doppelte und von Hand verworfene
// Pool-Leads (alle Endstatus außer „delivered“) verlieren PPL_DISCARD_DELETE_DAYS (Standard 30) Tage nach Eingang
// Name, Telefon, E-Mail und Antworten (engine.ts expireDiscarded). Auswertungsfelder bleiben.
// Die Dublettenprüfung (engine.ts duplicateWhere, 30 Tage) vergleicht nur mit „delivered“ und „parked“, verworfene
// Leads zählen dort nicht; die Frist kollidiert also nicht mit dem Dubletten-Fenster.
// Reine Helfer ohne Datenbank (getestet).

const DAY = 86_400_000;
export const DEFAULT_DISCARD_DELETE_DAYS = 30;

/** Endstatus verworfener Leads: ungültig (auch „verworfen (Admin)“), Dublette, verfallen (geparkt > Frist). */
export const DISCARD_STATUSES = ["invalid", "duplicate", "expired"] as const;

/** Frist in Tagen (Env PPL_DISCARD_DELETE_DAYS, sonst 30). */
export function discardDeleteDays(env: string | undefined = process.env.PPL_DISCARD_DELETE_DAYS): number {
  const n = Number(env);
  return env?.trim() && Number.isFinite(n) && n > 0 ? n : DEFAULT_DISCARD_DELETE_DAYS;
}

/** Leads mit Eingang bis einschließlich diesem Zeitpunkt sind fällig. */
export function discardCutoff(now: Date, days = discardDeleteDays()): Date {
  return new Date(now.getTime() - days * DAY);
}

/** Kontaktdaten fällig zum Löschen: verworfener Endstatus, kein Lead beim Käufer, Frist ab Eingang erreicht. */
export function discardDue(pl: { status: string; leadId: string | null; createdAt: Date }, now = new Date(), days = discardDeleteDays()): boolean {
  return (DISCARD_STATUSES as readonly string[]).includes(pl.status) && !pl.leadId && pl.createdAt.getTime() <= discardCutoff(now, days).getTime();
}
