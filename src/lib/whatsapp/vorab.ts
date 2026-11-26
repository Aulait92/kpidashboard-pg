// „Weiter auf WhatsApp“ nach der Buchung (Ole, 26.11.2026): Wer über die Buchungsseite gebucht und die
// Komplettcheck-Frage beantwortet hat, schreibt mit einem Klick per WhatsApp weiter (wa.me mit vorbefülltem Text an die
// WhatsApp-Nummer des Vermittlers). Kommt genau diese (oder eine ähnliche) Nachricht an, startet die Vorbereitung sofort
// (termin-strecke.ts vorbereitungUeberBuchungsseite). Rein, ohne Datenbank (auch für die Seite und Tests).

/** Vorbefüllter Text im WhatsApp-Chat (Sie und Du gleich, Ich-Form des Leads). */
export const VORAB_TEXT = "Ja, gern beantworte ich die Fragen vorab.";

/** WhatsApp-Nummer für wa.me: international ohne +, 0049… bzw. führende 0 → 49…; null, wenn unbrauchbar. */
export function waNummer(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 8) return null;
  return digits.startsWith("0") ? `49${digits.slice(1)}` : digits;
}

/** wa.me-Link mit dem vorbefüllten Text; null ohne brauchbare Nummer. */
export function waVorabLink(nummer: string | null | undefined): string | null {
  const n = waNummer(nummer);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(VORAB_TEXT)}` : null;
}

/**
 * Ist das die vorbefüllte Nachricht (bzw. eine leicht geänderte)? Eindeutig: „Fragen“ und „vorab“ mit „beantworte“ oder
 * einem „Ja“ am Anfang, kurz, ohne Frage oder Verneinung. „Ja“ allein bleibt bei vorbereitungAusText.
 */
export function istVorabNachricht(text: string | null | undefined): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 120 || t.includes("?")) return false;
  if (/\b(nicht|kein|keine|lieber im termin)\b/.test(t)) return false;
  if (!/\bfragen\b/.test(t) || !/\bvorab\b/.test(t)) return false;
  return /\bbeantworte/.test(t) || /^(ja|jap|jo|gern|gerne|klar)\b/.test(t);
}
