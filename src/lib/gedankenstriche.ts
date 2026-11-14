// Keine Gedankenstriche (– oder —) in Texten an Leads, Bestandskunden und Kunden (Ole, 14.11.2026,
// AGENTS.md „Texte an Leads und Kunden“). Bis-Striche in Zahlenbereichen („1–3 Tage“) bleiben.
// Sicherheitsnetz an allen Ausgängen (WhatsApp, E-Mail, KI-Texte, gespeicherte Vorlagen).

const DASH = /[–—]/;

/** Enthält der Text einen Gedankenstrich (Bis-Striche zwischen Zahlen zählen nicht)? */
export function hatGedankenstrich(t: string | null | undefined): boolean {
  if (!t) return false;
  return DASH.test(t.replace(/(\d)\s?[–—]\s?(\d)/g, "$1$2"));
}

/**
 * Gedankenstriche ersetzen: „1–3“ bleibt, Aufzählungsstrich am Zeilenanfang → „•“, sonst Komma
 * („Hallo – wie geht's“ → „Hallo, wie geht's“). Ein einzelnes „–“ als Platzhalter bleibt stehen.
 */
export function ohneGedankenstriche(t: string): string;
export function ohneGedankenstriche(t: string | null | undefined): string | null | undefined;
export function ohneGedankenstriche(t: string | null | undefined): string | null | undefined {
  if (!t || !DASH.test(t) || t.trim() === "–" || t.trim() === "—") return t;
  const RANGE = "\u0000";
  return t
    .replace(/(\d)\s?[–—]\s?(\d)/g, `$1${RANGE}$2`)
    .replace(/^([ \t]*)[–—][ \t]+/gm, "$1• ")
    .replace(/[ \t]*[–—][ \t]*([.!?:;,])/g, "$1")
    .replace(/[ \t]+[–—][ \t]+/g, ", ")
    .replace(/[ \t]*[–—][ \t]*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(new RegExp(RANGE, "g"), "–");
}
