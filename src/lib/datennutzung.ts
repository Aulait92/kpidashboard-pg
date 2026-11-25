// Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026): Texte, Textversion und reine Regeln, auch im
// Browser nutzbar. Datenbank-Teil: lib/datennutzung-server.ts.
//
// Zwei Dinge teilen wir den Kunden (Vermittlern) mit, mit Widerspruch je Punkt:
//   (a) neuer Unterauftragsverarbeiter Amazon Web Services EMEA SARL (Bedrock, Rechenzentrum Frankfurt) für KI bei
//       Gesprächszusammenfassungen und für das Auslesen von Unterlagen (AVV Anlage 2, lib/legal-texts.ts SUBPROCESSORS);
//   (b) gemeinsames Anzeigenlernen: Muster und Ergebnisse der Anzeigen aller Kunden fließen in Anzeigen anderer Kunden
//       ein (lib/kampagnen, Leitplanken dort; wer widersprochen hat, steht in lib/anzeigenlernen.ts).
// Herleitung: docs/recht/rechtspruefung-2026-11-23.md (F9, F12, Entscheidungen Ole 24.11.2026), Umsetzung und
// Pflichtangaben: docs/recht/2026-11-24-hinweis-ki-anzeigenlernen.md.
//
// Wer: Inhaber eines Software-Kunden (Betreuung + Software, Pay-per-Lead + Software), beim normalen Arbeiten, oft am
// Handy. Aufgabe: die zwei Änderungen zur Kenntnis nehmen und mit einem Tipp bestätigen; wer mehr wissen oder
// widersprechen will, kommt über „Mehr erfahren“ zur Detailseite (Einstellungen → KI-Hilfe und Anzeigenlernen).
// Die Wortlaute sind von Ole freigegeben: nur zusammen mit DATENNUTZUNG_VERSION ändern.

import { mitCrm, type PackageInput } from "@/lib/customer-package";

/**
 * Textversion von Banner und Detailseite. Am Kunden und im Nachweis gespeichert. Eine neue Version zeigt das Banner
 * allen Inhabern erneut (und hält die erste Anzeige neu fest); bestehende Widersprüche bleiben davon unberührt.
 */
export const DATENNUTZUNG_VERSION = "2026-11-24";

/** Detailseite (auch ohne offenes Banner: Einstellungen, Neuigkeit). */
export const DATENNUTZUNG_PFAD = "/buyer/einstellungen/datennutzung";
/** Eintrag in den Einstellungen (so nennt ihn auch die Neuigkeit). */
export const DATENNUTZUNG_EINTRAG = "KI-Hilfe und Anzeigenlernen";

// Banner-Wortlaut gekürzt (Ole, 25.11.2026, Usability-Check U2): ein Absatz statt Überschrift und fünf Zeilen, alle
// Pflichtangaben stehen weiter auf der Detailseite. Die Textversion bleibt, weil sich am Inhalt (zwei Punkte, 14 Tage
// Widerspruch) nichts ändert; der Nachweis speichert den angezeigten Wortlaut je Eintrag.
export const BANNER_TEXT = {
  text: "Neu: Wir nutzen zusätzlich Amazon Web Services (Frankfurt) für KI-Funktionen, und Ihre Anzeigen lernen anonym aus den Ergebnissen aller Kunden. So werden die Anzeigen für alle besser. Widerspruch innerhalb von 14 Tagen möglich.",
  verstanden: "Verstanden",
  mehr: "Mehr erfahren",
} as const;

/** Wortlaut des Banners für den Nachweis (wie angezeigt). */
export const BANNER_WORTLAUT = BANNER_TEXT.text;

export type DetailPunkt = { label: string; text: string; pdf?: string };

/** Die sechs Punkte der Detailseite, in dieser Reihenfolge („Label: Text“). */
const DETAIL_PUNKTE: readonly DetailPunkt[] = [
  {
    label: "Neuer Unterauftragsverarbeiter",
    text: "Amazon Web Services EMEA SARL, Rechenzentrum Frankfurt. Zweck: KI für Gesprächszusammenfassungen und das Auslesen von Unterlagen.",
  },
  {
    label: "Gemeinsames Anzeigenlernen",
    text: "Anzeigen-Muster (Aufhänger, Textaufbau, Bildidee) und Ergebnisse aller Kunden fließen in die Anzeigen anderer Kunden ein. Das gilt in beide Richtungen. So werden die Anzeigen für alle besser.",
  },
  { label: "Was nie übernommen oder gezeigt wird", text: "Namen, Fotos von Personen, Logos und Zahlen einzelner Kunden." },
  {
    label: "Widerspruch",
    text: "innerhalb von 14 Tagen über den Knopf „Widersprechen“ unten oder per Antwort an den Support. Sie können beiden Punkten oder nur einem davon widersprechen.",
  },
  { label: "Ihre Bestätigung", text: "Ihr Klick auf „Verstanden“ wird mit Datum gespeichert." },
  { label: "Zum Nachlesen", text: "Dieser Text bleibt unter Neuigkeiten und in den Einstellungen abrufbar.", pdf: "Liste der Unterauftragnehmer (PDF)" },
];

export const DETAIL_TEXT = {
  titel: "Was sich ändert und was Sie wählen können",
  punkte: DETAIL_PUNKTE,
  widersprechen: "Widersprechen",
  zuruecknehmen: "Widerspruch zurücknehmen",
} as const;

/** Die zwei Punkte, denen der Inhaber einzeln widersprechen kann. */
export const WIDERSPRUCH_PUNKTE = ["anzeigenlernen", "aws"] as const;
export type Punkt = (typeof WIDERSPRUCH_PUNKTE)[number];
export const istPunkt = (v: unknown): v is Punkt => WIDERSPRUCH_PUNKTE.includes(v as Punkt);

/** Dialog „Widersprechen“: je Punkt ein Haken („Label: Text“). wirkung = derselbe Satz für den Stand nach dem Senden. */
export const DIALOG_TEXT = {
  titel: "Wem möchten Sie widersprechen?",
  punkte: {
    anzeigenlernen: {
      label: "Gemeinsames Anzeigenlernen",
      text: "Sie werden vom Lernen ausgenommen. Ihre Anzeigen werden nicht für andere Kunden genutzt.",
      wirkung: "Sie sind vom Lernen ausgenommen. Ihre Anzeigen werden nicht für andere Kunden genutzt.",
    },
    aws: {
      label: "Amazon Web Services",
      text: "Gesprächszusammenfassungen und das Auslesen von Unterlagen sind dann nicht verfügbar.",
      wirkung: "Die KI-Hilfe für Gesprächszusammenfassungen und das automatische Auslesen von Unterlagen sind abgeschaltet.",
    },
  } satisfies Record<Punkt, { label: string; text: string; wirkung: string }>,
  senden: "Widerspruch senden",
  abbrechen: "Abbrechen",
} as const;

/** Satz unter dem Eintrag in den Einstellungen: aktiver Widerspruch auf einen Blick, sonst der Titel der Seite. */
export function eintragText(widerspruch: Record<Punkt, string | null>): string {
  const aktiv = WIDERSPRUCH_PUNKTE.filter((p) => widerspruch[p]).map((p) => DIALOG_TEXT.punkte[p].label);
  return aktiv.length ? `Widerspruch aktiv: ${aktiv.join(" und ")}` : DETAIL_TEXT.titel;
}

/** Wortlaut einer Dialogzeile für den Nachweis. */
export const punktWortlaut = (p: Punkt) => `${DIALOG_TEXT.punkte[p].label}: ${DIALOG_TEXT.punkte[p].text}`;

/** Rückmeldungen nach den Aktionen (kurz, ein Satz; „zurücknehmen“ nur nennen, weil es den Knopf dafür gibt). */
export const MELDUNG = {
  verstanden: "Danke, gespeichert",
  widerspruch: "Widerspruch gespeichert. Sie können ihn in den Einstellungen jederzeit zurücknehmen.",
  ruecknahme: "Widerspruch zurückgenommen",
  fehler: "Das hat nicht geklappt. Bitte noch einmal versuchen.",
} as const;

// ─── Regeln ─────────────────────────────────────────────────────────────────

type Ctx = { userId: string | null; preview: boolean; teamRole?: string | null; demo?: boolean };

/**
 * Echter Inhaber-Login: kein Mitarbeiter (Berater), keine Admin-Vorschau („Als Kunde ansehen“) und keine öffentliche
 * App-Demo. Die App-Store-Prüfer landen immer in der App-Demo (lib/app-demo/app-review.ts, kein echtes Konto), sind
 * damit ebenfalls ausgenommen.
 */
export const istInhaberLogin = (ctx: Ctx): boolean => !!ctx.userId && !ctx.preview && !ctx.demo && ctx.teamRole !== "advisor";

/**
 * Software-Kunde? Betreuung + Software bzw. Pay-per-Lead + Software (lib/customer-package.ts mitCrm). Nicht: reines
 * Pay-per-Lead, „Nur Betreuung“, „Nur Leads“, interne Konten und reine Bestellkonten (lib/ppl/bestellkonto.ts).
 */
export const istSoftwareKunde = (c: PackageInput, o: { bestellkonto?: boolean } = {}): boolean => mitCrm(c) && !o.bestellkonto;

/** Für diese Textversion schon bestätigt? */
export function istVerstanden(c: { datennutzungVerstandenAt?: Date | string | null; datennutzungVerstandenVersion?: string | null }, version: string = DATENNUTZUNG_VERSION): boolean {
  return !!c.datennutzungVerstandenAt && c.datennutzungVerstandenVersion === version;
}

/** Banner zeigen: nur Inhaber eines Software-Kunden, bis „Verstanden“ für die aktuelle Textversion gespeichert ist. */
export function bannerFaellig(
  o: { inhaber: boolean; software: boolean; verstandenAt?: Date | string | null; verstandenVersion?: string | null },
  version: string = DATENNUTZUNG_VERSION,
): boolean {
  return o.inhaber && o.software && !istVerstanden({ datennutzungVerstandenAt: o.verstandenAt, datennutzungVerstandenVersion: o.verstandenVersion }, version);
}

/**
 * Das Banner steht nur auf „Heute“ (Usability-Check 25.11.2026, U2): dort beginnt der Arbeitstag, auf Kontakt, Chat und
 * Unterseiten nähme es am Handy den ersten Bildschirm weg. Nie auf der Detailseite (dort steht der ganze Text mit
 * „Verstanden“) und nie in der Beratungspräsentation.
 */
export function bannerAufSeite(pfad: string): boolean {
  return pfad === "/buyer";
}

// ─── Hinweis an den abgeschalteten Stellen (Widerspruch Amazon Web Services) ─────────────────

export const tagText = (d: Date | string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));

/** Was an der Stelle abgeschaltet ist (so steht es im Satz). */
export type KiAusWas = "KI-Hilfe" | "Automatisches Auslesen";
/** Für die Oberfläche: Datum des Widerspruchs und ob der Angemeldete es selbst ändern kann (nur der Inhaber). */
export type KiAus = { am: string; inhaber: boolean };

/**
 * Ruhiger Hinweis statt eines Fehlers, in zwei Sätzen: was aus ist und seit wann, dann der nächste Schritt. Der
 * Inhaber ändert es in den Einstellungen (Link auf DATENNUTZUNG_PFAD), Mitarbeiter wenden sich an ihn.
 */
export function kiAusSaetze(was: KiAusWas, k: KiAus): { was: string; schritt: string } {
  return {
    was: `${was} ist für Ihr Konto abgeschaltet (Widerspruch vom ${tagText(k.am)}).`,
    schritt: k.inhaber ? "In den Einstellungen können Sie das ändern." : "Ihr Inhaber kann das in den Einstellungen ändern.",
  };
}
export const kiAusText = (was: KiAusWas, k: KiAus): string => {
  const s = kiAusSaetze(was, k);
  return `${s.was} ${s.schritt}`;
};
