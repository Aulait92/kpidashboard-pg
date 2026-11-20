// Zeitregeln der Terminerinnerungen im Vertrieb (rein, ohne Datenbank): gemeinsam genutzt vom Versand
// (E-Mail: runSalesBookingReminders in lib/vertrieb/buchung.ts, WhatsApp: runSalesWhatsAppReminders in
// lib/vertrieb/termin-whatsapp.ts) und von der Übersicht „Geplante Nachrichten“ (lib/vertrieb/geplante-nachrichten.ts),
// damit Versand und Übersicht nicht auseinanderlaufen.
//
// - 24 Stunden vorher: gesendet, solange der Termin 2 bis 24 Stunden entfernt ist; nur, wenn mehr als 26 Stunden im
//   Voraus gebucht (E-Mail: gemessen an der Buchung dieses Termins, WhatsApp: an der ursprünglichen Buchung).
//   WhatsApp entfällt, wenn die Bestätigung keine 2 Stunden her ist.
// - 1 Stunde vorher: gesendet, solange der Termin 10 Minuten bis 1 Stunde entfernt ist; nur, wenn mindestens
//   3 Stunden im Voraus gebucht (gemessen an der ursprünglichen Buchung).

const MIN = 60_000;
const HOUR = 60 * MIN;

export type TerminErinnerungArt = "tag" | "gleich";

export const TERMIN_ERINNERUNGEN: Record<TerminErinnerungArt, { vorher: number; bisVorher: number; minVorlauf: number; label: string }> = {
  tag: { vorher: 24 * HOUR, bisVorher: 2 * HOUR, minVorlauf: 26 * HOUR, label: "Terminerinnerung 24 Stunden vorher" },
  gleich: { vorher: HOUR, bisVorher: 10 * MIN, minVorlauf: 3 * HOUR, label: "Terminerinnerung 1 Stunde vorher" },
};

/** Keine 24-Stunden-Erinnerung per WhatsApp, wenn die Bestätigung erst so kurz her ist. */
export const NACH_BESTAETIGUNG_MS = 2 * HOUR;

/** Termine, die ein Lauf zu `now` erinnert: Beginn in (now + bisVorher, now + vorher]. */
export function erinnerungsFenster(art: TerminErinnerungArt, now: Date): { gt: Date; lte: Date } {
  const k = TERMIN_ERINNERUNGEN[art];
  return { gt: new Date(now.getTime() + k.bisVorher), lte: new Date(now.getTime() + k.vorher) };
}

/**
 * Genug im Voraus gebucht? E-Mail 24 Stunden: mehr als 26 Stunden ab Buchung dieses Termins (`gebucht`), sonst
 * mindestens `minVorlauf` ab der ursprünglichen Buchung (`urspruenglich`, bei verschobenen Terminen der erste der Kette).
 */
export function vorlaufOk(art: TerminErinnerungArt, kanal: "email" | "whatsapp", m: { startAt: Date; gebucht: Date; urspruenglich: Date }): boolean {
  const k = TERMIN_ERINNERUNGEN[art];
  if (art === "tag" && kanal === "email") return m.startAt.getTime() - m.gebucht.getTime() > k.minVorlauf;
  return m.startAt.getTime() - m.urspruenglich.getTime() >= k.minVorlauf;
}

/** 24-Stunden-WhatsApp entfällt, wenn die Bestätigung (gesendet) zum Versandzeitpunkt keine 2 Stunden her ist. */
export function direktNachBestaetigung(waConfirm: { status: string | null; at: Date | null }, versand: Date): boolean {
  return waConfirm.status === "sent" && !!waConfirm.at && versand.getTime() - waConfirm.at.getTime() < NACH_BESTAETIGUNG_MS;
}

/**
 * Zeitpunkt, zu dem ein Lauf die Erinnerung sendet: Beginn minus `vorher`, frühestens jetzt. null, wenn das Fenster
 * schon vorbei ist (Termin näher als `bisVorher`). `sofort`: schon fällig, geht beim nächsten Lauf raus.
 */
export function erinnerungsZeit(art: TerminErinnerungArt, startAt: Date, now: Date): { at: Date; sofort: boolean } | null {
  const k = TERMIN_ERINNERUNGEN[art];
  if (startAt.getTime() - k.bisVorher <= now.getTime()) return null;
  const at = startAt.getTime() - k.vorher;
  return at <= now.getTime() ? { at: now, sofort: true } : { at: new Date(at), sofort: false };
}
