// Entscheidungs-Call in Texten an Interessenten (Ole, 17.11.2026): Meist ist der Entscheidungs-Call schon im
// Sales-Termin gebucht. Dann nennen Angebotsmail, Angebotsseite und Zahlungserinnerung den gebuchten Termin
// (mit Link zum Verschieben). Ohne Buchung steht dort nichts (Ole bucht den Call immer selbst im Sales-Call).
// Geprüft wird beim Versand bzw. Aufruf (lib/vertrieb/entscheidungs-call-server.ts), nicht bei der Angebotserstellung.
// Reine Texte hier (Sie- und Du-Form, ohne Gedankenstriche), Zeiten in Europe/Berlin.

export type EntscheidungsCall =
  /** Zukünftiger Entscheidungs-Call am Kontakt (eigene Buchungsseite, Calendly oder vom Team eingetragen) */
  | { art: "gebucht"; startAt: Date; telefon: boolean; verschiebenUrl: string | null }
  /** Noch nicht gebucht, online buchbar: persönlicher Buchungslink */
  | { art: "link"; url: string }
  /** Noch nicht gebucht und online nicht buchbar (oder kein Vertriebskontakt) */
  | { art: "keiner" };

const TZ = "Europe/Berlin";

/** „Donnerstag, 20. November“ und „10:00“ (Berlin). */
export function terminTagZeit(d: Date): { tag: string; zeit: string } {
  return {
    tag: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d),
    zeit: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

/** Kurz für den Admin: „Do 20.11. 10 Uhr“ bzw. „Do 20.11. 10:30 Uhr“ (Berlin). */
export function terminKurz(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const wd = String(p.weekday ?? "").replace(/\.$/, "");
  const uhr = p.minute === "00" ? String(Number(p.hour)) : `${Number(p.hour)}:${p.minute}`;
  return `${wd} ${p.day}.${p.month}. ${uhr} Uhr`;
}

export type EntscheidungsCallText = {
  /** Satz vor dem Link (bei „gebucht“ ohne Link: vollständiger Text) */
  satz: string;
  url: string | null;
  /** Beschriftung des Links (HTML, Angebotsseite) */
  linkLabel: string;
};

/** Text zum Entscheidungs-Call für Mails und die Angebotsseite. null: nichts zu sagen. */
export function entscheidungsCallText(s: EntscheidungsCall, du = false): EntscheidungsCallText | null {
  // Ole bucht den Entscheidungs-Call immer selbst im Sales-Call (17.11.2026): ohne Buchung kein Satz und kein Link
  if (s.art !== "gebucht") return null;
  const { tag, zeit } = terminTagZeit(s.startAt);
  const kanal = s.telefon ? "am Telefon" : "per Video";
  const wie = s.telefon
    ? du ? "Wir rufen dich an." : "Wir rufen Sie an."
    : du ? "Den Link findest du in deiner Kalendereinladung." : "Den Link finden Sie in Ihrer Kalendereinladung.";
  const fragen = du ? "deine Fragen" : "Ihre Fragen";
  const start = `Wir sprechen am ${tag} um ${zeit} Uhr ${kanal} über ${fragen} und den Start. ${wie}`;
  if (!s.verschiebenUrl) {
    return { satz: `${start} ${du ? "Falls etwas dazwischenkommt, gib uns bitte kurz Bescheid." : "Falls etwas dazwischenkommt, geben Sie uns bitte kurz Bescheid."}`, url: null, linkLabel: "" };
  }
  return { satz: `${start} Falls etwas dazwischenkommt:`, url: s.verschiebenUrl, linkLabel: "Termin verschieben" };
}

/** Als reiner Text (Mail): Buchungslink in eigener Zeile, Link zum Verschieben direkt hinter dem Satz. */
export function entscheidungsCallMailText(s: EntscheidungsCall, du = false): string | null {
  const t = entscheidungsCallText(s, du);
  if (!t) return null;
  if (!t.url) return t.satz;
  return s.art === "link" ? `${t.satz}\n${t.url}` : `${t.satz} ${t.url}`;
}

/** Hinweis im Admin beim Versenden: welche Variante rausgeht. */
export function entscheidungsCallHinweis(s: EntscheidungsCall): string {
  if (s.art === "gebucht") return `Entscheidungs-Call ist gebucht: ${terminKurz(s.startAt)}, die Mail nennt den Termin`;
  return "Kein Entscheidungs-Call gebucht: die Mail nennt keinen Termin";
}
