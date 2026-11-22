// „Nicht erreicht“ im Vertriebs-CRM (Ole, 22.11.2026): nach dem Anruf-Ergebnis „Nicht erreicht“ gehen eine E-Mail und
// eine WhatsApp mit Buchungslink raus. Reine Regeln und Texte ohne Datenbank; Versand in nicht-erreicht-server.ts.
//
// Regeln:
// - Nur warme Kontakte (Formular-Lead, Termin, Angebot, Antwort per Mail oder WhatsApp, „WhatsApp erlaubt“). Reine
//   Kaltkontakte bekommen nichts: WhatsApp ohne Einwilligung verstößt gegen § 7 UWG und gefährdet die Support-Nummer
//   (Qualitätsbewertung bei Meta), Mails gingen über die Hauptdomain (Kalt-Mail-Regeln: nie über die Hauptdomain).
// - Höchstens einmal je 7 Tage je Kontakt (mehrere Anrufversuche hintereinander lösen nicht jedes Mal etwas aus).
// - Nie bei Sperre (Sperrliste, Nie kontaktieren, Abmeldung, Datenschutzfall).
// - WhatsApp nur an Mobilnummern und erst, wenn die Vorlage bei Meta freigegeben ist (UTILITY); bis dahin nur die Mail.

export const NICHT_ERREICHT_SPERRE_TAGE = 7;
/** Verlaufseintrag (SalesActivity.outcome), zugleich Merkmal für die 7-Tage-Sperre. */
export const NE_MAIL_AKTIVITAET = "Nicht erreicht: E-Mail gesendet";
export const NE_WA_AKTIVITAET = "Nicht erreicht: WhatsApp gesendet";

export type NichtErreichtLage = {
  gesperrt: boolean;
  warm: boolean;
  /** Letzte „Nicht erreicht“-Nachricht (Mail oder WhatsApp) */
  letzteNachricht: Date | null;
};

/** Grund, gar nichts zu senden, oder null. */
export function nichtErreichtStopp(l: NichtErreichtLage, now: Date): string | null {
  if (l.gesperrt) return "gesperrt";
  if (!l.warm) return "Kaltkontakt";
  if (l.letzteNachricht && now.getTime() - l.letzteNachricht.getTime() < NICHT_ERREICHT_SPERRE_TAGE * 86_400_000) return "schon gesendet";
  return null;
}

/** Warm = es gab schon einen Austausch oder der Kontakt hat sich selbst gemeldet. */
export function istWarm(x: { inbound: boolean; termin: boolean; angebot: boolean; antwort: boolean; whatsappErlaubt: boolean; source: string | null }): boolean {
  return x.inbound || x.termin || x.angebot || x.antwort || x.whatsappErlaubt || ["META_ADS", "INBOUND", "EMPFEHLUNG"].includes(x.source ?? "");
}

// ─── Texte (Sie-Form, ohne Gedankenstriche, Absender Ole) ─────────────────

export type NichtErreichtMail = { subject: string; paragraphs: string[]; button: { label: string; url: string } | null };

export function nichtErreichtMail(o: { buchungslink: string | null }): NichtErreichtMail {
  return {
    subject: "Ich habe Sie gerade nicht erreicht",
    paragraphs: [
      "ich habe eben versucht, Sie anzurufen, leider ohne Erfolg.",
      o.buchungslink
        ? "Suchen Sie sich gern direkt einen passenden Termin für ein kurzes Gespräch von 15 Minuten aus. Oder antworten Sie mir mit einer Zeit, zu der ich Sie gut erreiche."
        : "Antworten Sie mir gern mit einer Zeit, zu der ich Sie gut erreiche, dann rufe ich Sie zurück.",
    ],
    button: o.buchungslink ? { label: "Termin aussuchen", url: o.buchungslink } : null,
  };
}

// WhatsApp-Vorlage der Support-Nummer (Einreichung im WhatsApp-Cron mit SUPPORT_TEMPLATES, lib/vertrieb/termin-whatsapp.ts).
// Kein Punkt direkt hinter dem Link.
export const NE_TEMPLATE_PURPOSE = "vertrieb_nicht_erreicht";
export const NE_TEMPLATE_NAME = "pg_vertrieb_nicht_erreicht_v1";
export const NE_TEMPLATE_BODY =
  "Guten Tag {{1}}, hier ist Ole Kannapinn von performancegrowth. Ich habe eben versucht, Sie anzurufen. " +
  "Hier können Sie sich direkt einen passenden Termin aussuchen: {{2}} Oder schreiben Sie mir einfach, wann ich Sie gut erreiche.";
export const NE_TEMPLATE_EXAMPLES = ["Herr Mustermann", "https://app.performancegrowth.de/termin/erstgespraech"];
