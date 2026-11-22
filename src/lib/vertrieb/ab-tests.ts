// A/B-Tests der automatischen Nachrichten aus dem Vertriebs-CRM an unsere eigenen Leads (Vermittler im Vertrieb und
// Neukunden). Auftrag Ole 22.11.2026, entwickelt vom A/B-Test-Labor; Lernbuch docs/firma/ab-tests.md, Hypothesen
// lib/ab-hypothesen.ts, Technik lib/experimente.ts. Reine Texte und Schlüssel ohne Datenbank; Zuteilung und Ziele in
// lib/vertrieb/ab-tests-server.ts.
//
// Wenig Volumen (wenige Angebote und Termine je Woche): darum nur drei Tests mit großem Hebel, und wo mehrere Mails zum
// selben Ziel führen, laufen sie gemeinsam in einem Test (eine Änderung, eine Einheit, ein Ziel):
//
// 1. vertrieb_angebot_naechste_schritte (Einheit Angebots-ID): Angebotsmail, Bonus-Erinnerungen und Zahlungserinnerungen.
//    Hypothese: Wer vor dem Ja sieht, was danach konkret passiert (Zahlung einrichten, Zugang, Einrichtung Schritt für
//    Schritt mit Anleitung, persönliche Hilfe), hat weniger Sorge vor Aufwand und nimmt öfter an und zahlt.
//    Ziel: Zahlung eingerichtet (Auftrag wirklich gewonnen), Gegenprobe Angebot angenommen.
// 2. vertrieb_termin_vorabfrage (Einheit Termin-ID): Terminerinnerung 24 Stunden vorher.
//    Hypothese: Eine Vorab-Frage nach dem wichtigsten Anliegen macht den Termin zu „seinem“ Gespräch statt zu einem
//    Verkaufstermin, wer antwortet, hat schon etwas investiert: Es erscheinen mehr.
//    Ziel: erschienen (nur Termine mit eingetragenem Ergebnis oder Absage).
// 3. vertrieb_followup_janein (Einheit Follow-up-ID): Später-Follow-up, Mail 1.
//    Hypothese: Eine Frage, die sich mit einem Wort beantworten lässt („Ist das Thema bei Ihnen noch aktuell?“), ist eine
//    kleinere Hürde als die Bitte um einen Termin: Es antworten mehr, der Buchungslink bleibt als Angebot danach.
//    Ziel: Antwort binnen 14 Tagen nach Mail 1 (gezählt 14 Tage nach Mail 1), Gegenprobe Termin gebucht.

import type { Variante } from "@/lib/experimente";

export const AB_ANGEBOT = "vertrieb_angebot_naechste_schritte";
export const AB_TERMIN = "vertrieb_termin_vorabfrage";
export const AB_FOLLOWUP = "vertrieb_followup_janein";

export const VERTRIEB_AB_TESTS = [AB_ANGEBOT, AB_TERMIN, AB_FOLLOWUP] as const;
export type VertriebAbTest = (typeof VERTRIEB_AB_TESTS)[number];

/** Ziele (lib/experimente.ts Ziel), gesetzt von vertriebZieleNachtragen bzw. beim Versand. */
export const ZIEL_ZAHLUNG = "zahlung_eingerichtet";
export const ZIEL_ANGENOMMEN = "angebot_angenommen";
export const ZIEL_ERSCHIENEN = "erschienen";
export const ZIEL_TERMIN_AUSGEWERTET = "termin_ausgewertet";
export const ZIEL_ANTWORT = "antwort";
/** Reife-Marke: Mail 1 ist seit mindestens 14 Tagen raus (nur diese Follow-ups zählen) */
export const ZIEL_FOLLOWUP_REIF = "followup_reif";
/** So lange nach Mail 1 zählt eine Antwort bzw. wird bewertet */
export const FOLLOWUP_REIF_TAGE = 14;
export const ZIEL_TERMIN = "termin_gebucht";

// ─── Test 1: Angebots-Strecke, Absatz „So geht es nach dem Ja weiter“ ─────────────

/** Absatz in Angebotsmail und Bonus-Erinnerung (Fassung B). Sie oder Du wie die Mail, ohne Gedankenstriche. */
export function naechsteSchritteAngebot(du: boolean): string {
  return du
    ? "So geht es nach deiner Annahme weiter: Du richtest die Zahlung ein und bekommst direkt danach deinen Zugang. Die Einrichtung führt dich Schritt für Schritt, mit kurzer Anleitung je Schritt, und bei Fragen helfe ich dir persönlich."
    : "So geht es nach Ihrer Annahme weiter: Sie richten die Zahlung ein und bekommen direkt danach Ihren Zugang. Die Einrichtung führt Sie Schritt für Schritt, mit kurzer Anleitung je Schritt, und bei Fragen helfe ich Ihnen persönlich.";
}

/** Absatz in der Zahlungserinnerung (Fassung B): was nach der Zahlung passiert. */
export function naechsteSchritteZahlung(du: boolean): string {
  return du
    ? "So geht es danach weiter: Du bekommst direkt deinen Zugang. Die Einrichtung führt dich Schritt für Schritt, mit kurzer Anleitung je Schritt, und bei Fragen helfe ich dir persönlich."
    : "So geht es danach weiter: Sie bekommen direkt Ihren Zugang. Die Einrichtung führt Sie Schritt für Schritt, mit kurzer Anleitung je Schritt, und bei Fragen helfe ich Ihnen persönlich.";
}

// ─── Test 2: Terminerinnerung 24 Stunden vorher, Vorab-Frage ──────────────────────

/**
 * Absatz in der Erinnerung 24 Stunden vorher (Fassung B). Die Terminmails an Interessenten sind immer Sie-Form
 * (lib/vertrieb/buchung.ts); die Du-Fassung steht für den Fall bereit, dass Terminmails einmal duzen.
 */
export function vorabFrageTermin(du = false): string {
  return du
    ? "Damit wir die Zeit gut nutzen: Was ist deine wichtigste Frage für unser Gespräch? Antworte einfach kurz auf diese E-Mail."
    : "Damit wir die Zeit gut nutzen: Was ist Ihre wichtigste Frage für unser Gespräch? Antworten Sie einfach kurz auf diese E-Mail.";
}

// ─── Test 3: Später-Follow-up, Mail 1 mit Ja/Nein-Frage ───────────────────────────

/** Abschluss von Mail 1 in der festen Vorlage (Fassung B, Sie-Form wie alle Follow-ups). */
export function janeinFrage(bookingUrl: string | null): string {
  return bookingUrl
    ? `Ist das Thema bei Ihnen noch aktuell? Ein kurzes Ja oder Nein als Antwort genügt mir.\n\nWenn ja, suchen Sie sich hier gern direkt einen Termin von 15 Minuten aus:\n${bookingUrl}`
    : "Ist das Thema bei Ihnen noch aktuell? Ein kurzes Ja oder Nein als Antwort genügt mir, dann melde ich mich passend.";
}

/** Anweisung für die KI zu Mail 1 (Fassung B), ersetzt „dann die Frage nach einem kurzen Termin“. */
export function janeinAnweisung(mitLink: boolean): string {
  return `dann eine kurze Frage, die sich mit einem Wort beantworten lässt, ob das Thema für ihn noch aktuell ist (zum Beispiel: "Ist das Thema bei Ihnen noch aktuell? Ein kurzes Ja oder Nein als Antwort genügt mir."), ${
    mitLink ? "danach der Buchungslink nur als Angebot (zum Beispiel: \"Wenn ja, suchen Sie sich hier gern direkt einen Termin von 15 Minuten aus:\")" : "danach das Angebot, sich passend zu melden"
  }. Keine direkte Bitte um einen Termin`;
}

// ─── Vorschau ─────────────────────────────────────────────────────────────────────

/** Ein Satz je Test für die Vorschau (Geplante Nachrichten, Einstellungen → Vorlagen). */
export const AB_KURZ: Record<VertriebAbTest, { a: string; b: string }> = {
  [AB_ANGEBOT]: { a: "ohne Absatz zu den nächsten Schritten", b: "mit Absatz „So geht es nach Ihrer Annahme weiter“" },
  [AB_TERMIN]: { a: "ohne Vorab-Frage", b: "mit Vorab-Frage nach der wichtigsten Frage fürs Gespräch" },
  [AB_FOLLOWUP]: { a: "Mail 1 fragt nach einem Termin", b: "Mail 1 fragt „Ist das Thema bei Ihnen noch aktuell?“" },
};

/** Hinweis unter einer Vorschau: welche Fassung dieser Kontakt bekommt. */
export function abHinweis(test: VertriebAbTest, v: Variante, geplant = true): string {
  const k = AB_KURZ[test];
  return `A/B-Test: ${geplant ? "Dieser Kontakt bekommt " : ""}Fassung ${v.toUpperCase()} (${v === "b" ? k.b : k.a}).`;
}
