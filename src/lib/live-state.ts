// Reine Logik der Live-Aktualisierung (ohne Datenbank) – auch im Browser nutzbar.

export type FingerprintParts = {
  leads: { count: number; lastCreated: Date | null; lastStatus: Date | null };
  conversations: { count: number; lastUpdated: Date | null; attention: number };
  appointments: { count: number; lastUpdated: Date | null };
  /** Jüngste Chat-Nachricht (auch Echos aus der WhatsApp-Business-App und interne Vermerke). */
  messages?: { lastCreated: Date | null };
};

const t = (d: Date | null) => (d ? d.getTime().toString(36) : "-");

/** Kompakte, vergleichbare Darstellung (keine Inhalte, nur Zähler/Zeitstempel). */
export function fingerprintOf(p: FingerprintParts): string {
  return [
    `l${p.leads.count}.${t(p.leads.lastCreated)}.${t(p.leads.lastStatus)}`,
    `c${p.conversations.count}.${t(p.conversations.lastUpdated)}.${p.conversations.attention}`,
    `a${p.appointments.count}.${t(p.appointments.lastUpdated)}`,
    ...(p.messages ? [`m${t(p.messages.lastCreated)}`] : []),
  ].join("|");
}

/** Admin-Chats (/admin/whatsapp): nur Chats und Nachrichten, über alle Kunden. */
export type AdminChatParts = {
  conversations: { count: number; lastUpdated: Date | null; attention: number };
  messages: { lastCreated: Date | null };
};

export function adminChatFingerprintOf(p: AdminChatParts): string {
  return `c${p.conversations.count}.${t(p.conversations.lastUpdated)}.${p.conversations.attention}|m${t(p.messages.lastCreated)}`;
}

/** Zahl der Chats „Braucht dich“ aus einem Fingerabdruck (NaN, wenn nicht enthalten). */
export function attentionOf(fingerprint: string): number {
  return Number(fingerprint.match(/(?:^|\|)c\d+\.[^.|]*\.(\d+)(?:\||$)/)?.[1] ?? NaN);
}

/** Client-Logik: Soll jetzt neu geladen werden? (erste Meldung = nur Ausgangswert) */
export function nextLiveState(prev: string | null, incoming: string): { last: string; changed: boolean } {
  if (prev === null) return { last: incoming, changed: false };
  return { last: incoming, changed: prev !== incoming };
}
