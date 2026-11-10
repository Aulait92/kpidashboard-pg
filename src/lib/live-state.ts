// Reine Logik der Live-Aktualisierung (ohne Datenbank) – auch im Browser nutzbar.

export type FingerprintParts = {
  leads: { count: number; lastCreated: Date | null; lastStatus: Date | null };
  conversations: { count: number; lastUpdated: Date | null; attention: number };
  appointments: { count: number; lastUpdated: Date | null };
};

const t = (d: Date | null) => (d ? d.getTime().toString(36) : "-");

/** Kompakte, vergleichbare Darstellung (keine Inhalte, nur Zähler/Zeitstempel). */
export function fingerprintOf(p: FingerprintParts): string {
  return [
    `l${p.leads.count}.${t(p.leads.lastCreated)}.${t(p.leads.lastStatus)}`,
    `c${p.conversations.count}.${t(p.conversations.lastUpdated)}.${p.conversations.attention}`,
    `a${p.appointments.count}.${t(p.appointments.lastUpdated)}`,
  ].join("|");
}

/** Client-Logik: Soll jetzt neu geladen werden? (erste Meldung = nur Ausgangswert) */
export function nextLiveState(prev: string | null, incoming: string): { last: string; changed: boolean } {
  if (prev === null) return { last: incoming, changed: false };
  return { last: incoming, changed: prev !== incoming };
}
