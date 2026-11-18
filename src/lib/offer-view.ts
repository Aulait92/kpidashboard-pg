// Wann zählt ein Aufruf der Angebotsseite als „Vom Interessenten geöffnet“? (Ole, 18.11.2026)
// Nicht: eingeloggte Admins oder Vermittler (Ansehen, Vorschau, eigener Link) und Link-Vorschauen bzw. Scanner
// (Skype/Teams, Outlook-Prüfung, WhatsApp, Slack …). Anlass: PG-2026-0150 stand eine Minute nach dem Erstellen auf
// „geöffnet“, Ursache war die Link-Vorschau von Skype/Teams (SkypeUriPreview), nicht der Interessent.

const BOT_UA =
  /bot\b|bot\/|crawler|spider|preview|slurp|facebookexternalhit|whatsapp|telegram|skype|discord|embedly|linkedin|slack|teams|outlook|ms-office|msoffice|microsoft office|bingpreview|headless|python-|curl\/|wget\/|okhttp|go-http|java\/|axios|node-fetch|undici|scanner|proofpoint|mimecast|barracuda/i;

/** Link-Vorschau, Scanner oder Skript statt Mensch? Leerer User-Agent zählt als Maschine. */
export function istMaschine(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return !ua || BOT_UA.test(ua);
}

/** Zählt der Aufruf als Öffnung durch den Interessenten? */
export function zaehltAlsGeoeffnet(o: { sessionRole: string | null | undefined; userAgent: string | null | undefined }): boolean {
  if (o.sessionRole) return false; // Admin oder Vermittler eingeloggt
  return !istMaschine(o.userAgent);
}
