// Cockpit-Logik ohne Datenbank (Nachbesserung 20.11.2026, Persona-Abnahme, docs/ux/2026-11-19-bestand-champions.md):
// - heroPlan: Der Hauptknopf „Heute zuerst“ verspricht nur, was jetzt geht. WhatsApp-Vorlage noch nicht freigegeben →
//   E-Mail als Standard (in opportunities gerechnet), sonst der eine fehlende Schritt oder „vormerken“, nie ein toter Knopf.
// - reachSummary: eine Basis für alle Einwilligungs-Zahlen (Kunden mit Kontaktweg, nicht abgemeldet oder gesperrt),
//   die Differenz zur Kundenliste und zu „per E-Mail fragen“ in je einem Satz. Ziel erreicht → keine Aufforderung.
// - consentChip: gelber Chip als Handlung („6 Nachweise ergänzen“) mit Ziel direkt im Aufklapper.
// - lockedHeadline: gesperrter Zustand mit den eigenen Zahlen statt Fließtext.

import type { TemplateState } from "@/lib/whatsapp/vorlagen-hinweis";

const de = (n: number) => n.toLocaleString("de-DE");
const kunden = (n: number) => (n === 1 ? "1 Kunde" : `${de(n)} Kunden`);
const kundenAkk = (n: number) => (n === 1 ? "1 Kunden" : `${de(n)} Kunden`);

export type Schritt = { label: string; href: string };

export type HeroInput = {
  /** Empfänger der Chance (wie gerechnet: ggf. schon nur E-Mail) */
  count: number;
  whatsapp: number;
  email: number;
  /** Chance wurde auf „Nur E-Mail“ umgestellt, weil die WhatsApp-Vorlage noch nicht freigegeben ist */
  channelMode?: "email";
  /** WhatsApp-Empfänger warten auf die Vorlage und E-Mail geht gerade nicht */
  waWaiting?: boolean;
  /** So viele wären per E-Mail sofort erreichbar, wenn der fehlende Schritt erledigt ist */
  emailIfFixed?: number;
  /** Stand der WhatsApp-Vorlage dieses Anlasses */
  waState: TemplateState;
  /** Fehlender Schritt für E-Mail, den der Vermittler selbst erledigen kann (Postfach, Impressum); sonst null */
  mailFix: Schritt | null;
  /** Ziel der Kampagne (vorbelegt) */
  href: string;
  /** Beschriftung des normalen Knopfs („22 Kunden anschreiben“) */
  label: string;
};

export type HeroPlan = {
  /** Hauptknopf */
  primary: Schritt;
  /** Ein Satz zum Kanal-Status unter dem Knopf (null = alles normal) */
  status: string | null;
  /** Leiser Textlink neben dem Knopf (z. B. schon vormerken) */
  secondary: Schritt | null;
  /** Kanalzeile „15 per WhatsApp · 7 per E-Mail“ zeigen? */
  showChannels: boolean;
};

/** Ein Satz, warum WhatsApp gerade wartet (Stand der Vorlage). */
export function waWarteSatz(state: TemplateState): string {
  return state === "abgelehnt"
    ? "Meta hat die WhatsApp-Vorlage abgelehnt, wir kümmern uns darum und starten danach automatisch."
    : "Geht per WhatsApp raus, sobald Meta die Vorlage freigegeben hat, meist innerhalb weniger Stunden.";
}

/** Hauptknopf „Heute zuerst“: nur versprechen, was jetzt geht. */
export function heroPlan(i: HeroInput): HeroPlan {
  const normal: Schritt = { label: i.label, href: i.href };
  // Nur E-Mail-Empfänger, aber E-Mail fehlt ein Schritt: genau diesen Schritt zeigen
  if (i.whatsapp === 0 && i.email > 0 && i.mailFix && !i.channelMode) {
    return { primary: i.mailFix, status: `${kundenAkk(i.email)} schreiben Sie per E-Mail an, dafür fehlt nur noch dieser Schritt.`, secondary: null, showChannels: false };
  }
  if (i.waWaiting) {
    if ((i.emailIfFixed ?? 0) > 0 && i.mailFix) {
      return {
        primary: i.mailFix,
        status: `WhatsApp startet erst nach der Freigabe durch Meta, per E-Mail erreichen Sie ${kundenAkk(i.emailIfFixed ?? 0)} sofort.`,
        secondary: { label: "Schon vormerken", href: i.href },
        showChannels: false,
      };
    }
    return { primary: { label: `${kundenAkk(i.count)} vormerken`, href: i.href }, status: waWarteSatz(i.waState), secondary: null, showChannels: false };
  }
  if (i.channelMode === "email") {
    return { primary: normal, status: "Per E-Mail, weil Meta die WhatsApp-Vorlage noch nicht freigegeben hat.", secondary: null, showChannels: true };
  }
  return { primary: normal, status: null, secondary: null, showChannels: true };
}

export type ReachInput = {
  /** Kunden mit Kontaktweg, nicht abgemeldet oder gesperrt (Basis der Quote) */
  total: number;
  reachable: number;
  share: number;
  withoutConsent: number;
  /** davon per E-Mail fragbar (Sammelanfrage) */
  askable: number;
};

export type ReachSummary = {
  goalReached: boolean;
  /** „55 von 115 Kunden mit Kontaktweg“ */
  basis: string;
  /** Satz zur Differenz zur Kundenliste (null, wenn alle zählen) */
  basisHinweis: string | null;
  /** Satz zu den Kunden ohne Einwilligung (null, wenn es keine gibt) */
  ohne: string | null;
  /** Aufforderung zeigen? Nur unter dem Ziel und mit Kunden ohne Einwilligung */
  cta: boolean;
};

/** Eine Zählweise für Cockpit, Einwilligungsseite und Filter „Ohne Einwilligung“. listTotal = alle Kunden im Bestand. */
export function reachSummary(o: ReachInput, goal: number, listTotal: number): ReachSummary {
  const goalReached = o.total > 0 && o.share >= goal;
  const rest = Math.max(0, o.withoutConsent - o.askable);
  const aus = Math.max(0, listTotal - o.total);
  let ohne: string | null = null;
  if (o.withoutConsent > 0) {
    if (o.askable > 0 && rest > 0) ohne = `${kunden(o.withoutConsent)} ohne Einwilligung: ${de(o.askable)} per E-Mail fragen, die übrigen ${de(rest)} per Link oder im Gespräch.`;
    else if (o.askable > 0) ohne = `${kunden(o.withoutConsent)} ohne Einwilligung, alle per E-Mail fragbar.`;
    else ohne = `${kunden(o.withoutConsent)} ohne Einwilligung: per Link oder im Gespräch fragen.`;
  }
  return {
    goalReached,
    basis: `${de(o.reachable)} von ${kunden(o.total)} mit Kontaktweg`,
    basisHinweis: aus > 0 ? `${kunden(aus)} ohne Kontaktweg, abgemeldet oder gesperrt ${aus === 1 ? "zählt" : "zählen"} nicht mit.` : null,
    ohne,
    cta: !goalReached && o.withoutConsent > 0,
  };
}

export const RECHT_HREF = "/buyer/bestand/einwilligungen?offen=recht#recht";

export type ChipInput = { total: number; legacy: number; legacyReviewed: boolean; uwgConfirmed: boolean; noProof: number };

/** Gelber Hinweis-Chip als Handlung, Ziel ist der offene Aufklapper „Rechtliches und Nachweise“. */
export function consentChip(i: ChipInput): { chip: string; href: string; why: string } | null {
  if (!i.total) return null;
  if (i.legacy > 0 && !i.legacyReviewed) {
    return {
      chip: `${de(i.legacy)} ${i.legacy === 1 ? "Nachweis" : "Nachweise"} ergänzen`,
      href: RECHT_HREF,
      why: `Für ${kundenAkk(i.legacy)} gilt die Einwilligung nur aus Ihrer pauschalen Bestätigung beim Import („laut Versicherer“), bitte bestätigen Sie, dass sie nachweisbar ist.`,
    };
  }
  if (!i.uwgConfirmed) {
    return { chip: "Bestätigung für E-Mails ergänzen", href: RECHT_HREF, why: "Ohne Einwilligung gehen E-Mails nur nach § 7 Abs. 3 UWG raus, dafür fehlt noch Ihre Bestätigung." };
  }
  if (i.noProof > 0) {
    return {
      chip: `${de(i.noProof)} ${i.noProof === 1 ? "Nachweis" : "Nachweise"} ergänzen`,
      href: RECHT_HREF,
      why: `Für ${kundenAkk(i.noProof)} fehlt der Nachweis zum Hinweis auf das Widerspruchsrecht, E-Mails an sie gehen deshalb nur mit Einwilligung.`,
    };
  }
  return null;
}

/** Gesperrter Zustand: Überschrift aus den eigenen Zahlen (keine Ergebnisversprechen). */
export function lockedHeadline(z: { einVertrag: number; abschluesse: number }): { title: string; text: string } {
  const text = "Die App zeigt, wem ein weiteres Produkt fehlt, und schreibt die passenden Kunden mit einem Klick an.";
  if (z.einVertrag > 0) {
    return { title: z.einVertrag === 1 ? "Sie haben 1 Kunden mit nur einem Vertrag." : `Sie haben ${de(z.einVertrag)} Kunden mit nur einem Vertrag.`, text };
  }
  if (z.abschluesse > 0) {
    return { title: z.abschluesse === 1 ? "Sie haben 1 Kunden mit Abschluss." : `Sie haben ${de(z.abschluesse)} Kunden mit Abschluss.`, text };
  }
  return { title: "Geschäft im eigenen Bestand finden", text };
}
