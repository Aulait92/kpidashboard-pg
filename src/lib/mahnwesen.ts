// Mahnwesen (Ole, 17.11.2026): reine Funktionen ohne Datenbank (Stufenplan, Texte, Bankabgleich).
// Versand, Stripe-Abgleich und Cron: lib/mahnwesen-server.ts. Texte zum Gegenlesen: docs/mahnwesen-texte.md.
//
// Ein Mahnfall je offener Stripe-Rechnung:
// - Überweisung (Rechnung mit Zahlungsziel, collection_method send_invoice) oder
// - fehlgeschlagene Lastschrift/Karte (Webhook invoice.payment_failed, Fälligkeit = Tag des Fehlschlags).
// Stufen (je höchstens einmal, streng nacheinander, mindestens 3 Tage Abstand, Versand 9 bis 19 Uhr Berlin):
//   1 Erinnerung 3 Tage vor Fälligkeit (nur Überweisung, entfällt ab dem Fälligkeitstag)
//   2 Zahlungserinnerung am Fälligkeitstag (E-Mail und WhatsApp, Absender Ole Kannapinn)
//   3 1. Mahnung 7 Tage nach Fälligkeit (E-Mail mit Rechnung als PDF)
//   4 2. Mahnung 14 Tage nach Fälligkeit (E-Mail mit Rechnung als PDF)
//   5 Aufgabe „Kunde anrufen“ 21 Tage nach Fälligkeit (Admin „Heute“)
// Stopp: Zahlung eingegangen (Webhook invoice.paid, Bankabgleich), Rechnung nicht mehr offen, Schalter je Kunde.
// Verzugspauschale und Leads-Pause: nur vorbereitete Schalter (MahnwesenSettings), Standard aus, ohne Wirkung.
// Freigabe: nur mit MAHNWESEN=on (zuerst nur Staging, live erst nach Oles OK).

import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { fromDayKey } from "@/lib/vertrieb/dates";

/** Mahnwesen und Überweisung freigeschaltet (Umgebungsvariable, zuerst nur auf Staging). */
export function mahnwesenAktiv(env: Record<string, string | undefined> = process.env): boolean {
  return env.MAHNWESEN === "on";
}

export const UEBERWEISUNG_TAGE_STANDARD = 14;
export const UEBERWEISUNG_TAGE_MIN = 7;
export const UEBERWEISUNG_TAGE_MAX = 30;

/** Zahlungsziel aus einem Formularwert: ganze Tage zwischen 7 und 30, sonst Standard 14. */
export function parseZahlungsziel(v: unknown): number {
  const n = Math.round(Number(String(v ?? "").trim()));
  if (!Number.isFinite(n) || n <= 0) return UEBERWEISUNG_TAGE_STANDARD;
  return Math.min(UEBERWEISUNG_TAGE_MAX, Math.max(UEBERWEISUNG_TAGE_MIN, n));
}

export type MahnArt = "ueberweisung" | "lastschrift" | "karte" | "sonstige";

export const ART_LABEL: Record<MahnArt, string> = {
  ueberweisung: "Überweisung",
  lastschrift: "Lastschrift geplatzt",
  karte: "Karte abgelehnt",
  sonstige: "Zahlung fehlgeschlagen",
};

/** Art aus der Stripe-Rechnung (Einzugsart) und dem Typ der Zahlungsart. */
export function artVonRechnung(collectionMethod: string | null | undefined, pmType?: string | null): MahnArt {
  if (collectionMethod === "send_invoice") return "ueberweisung";
  if (pmType === "sepa_debit") return "lastschrift";
  if (pmType === "card" || pmType === "link") return "karte";
  return "sonstige";
}

export type StufeKey = "erinnerung" | "faellig" | "mahnung1" | "mahnung2" | "anruf";
export type Stufe = { nr: number; key: StufeKey; tage: number; label: string; nurUeberweisung?: boolean; mail: boolean };

export const STUFEN: readonly Stufe[] = [
  { nr: 1, key: "erinnerung", tage: -3, label: "Erinnerung vor Fälligkeit", nurUeberweisung: true, mail: true },
  { nr: 2, key: "faellig", tage: 0, label: "Zahlungserinnerung", mail: true },
  { nr: 3, key: "mahnung1", tage: 7, label: "1. Mahnung", mail: true },
  { nr: 4, key: "mahnung2", tage: 14, label: "2. Mahnung", mail: true },
  { nr: 5, key: "anruf", tage: 21, label: "Kunde anrufen", mail: false },
];

/** Mindestabstand zwischen zwei Stufen, falls ein Fall spät erkannt wurde (kein Nachholen im Block). */
export const MIN_ABSTAND_TAGE = 3;
export const VERSAND_AB_STUNDE = 9;
export const VERSAND_BIS_STUNDE = 19;

export function stufeLabel(nr: number): string {
  if (nr <= 0) return "Noch nichts gesendet";
  return STUFEN.find((s) => s.nr === nr)?.label ?? `Stufe ${nr}`;
}

export type FallZustand = {
  art: string;
  status: string;
  stufe: number;
  dueDate: Date;
  letzteMailAt: Date | null;
};

export type NaechsteStufe = { stufe: Stufe; tag: string; faelligAb: Date };

const tagVon = (d: Date) => berlinTodayIso(d);

/**
 * Nächste Stufe eines Falls (oder null: fertig, nicht offen oder gestoppt). Streng nacheinander: Eine Mahnung
 * kommt nie vor der Zahlungserinnerung. Die Erinnerung vor Fälligkeit entfällt bei Lastschrift/Karte und ab dem
 * Fälligkeitstag. Zwischen zwei Stufen liegen mindestens {@link MIN_ABSTAND_TAGE} Tage.
 */
export function naechsteStufe(f: FallZustand, now: Date, opts: { gestoppt?: boolean } = {}): NaechsteStufe | null {
  if (f.status !== "offen" || opts.gestoppt) return null;
  const heute = berlinTodayIso(now);
  const due = tagVon(f.dueDate);
  const offen = STUFEN.filter((s) => s.nr > f.stufe && (!s.nurUeberweisung || f.art === "ueberweisung"));
  let next = offen[0];
  while (next && next.key === "erinnerung" && heute >= due) next = offen[offen.indexOf(next) + 1];
  if (!next) return null;
  let tag = addDaysIso(due, next.tage);
  if (f.letzteMailAt) {
    const min = addDaysIso(tagVon(f.letzteMailAt), MIN_ABSTAND_TAGE);
    if (min > tag) tag = min;
  }
  return { stufe: next, tag, faelligAb: fromDayKey(tag, `${String(VERSAND_AB_STUNDE).padStart(2, "0")}:00`) };
}

/** Jetzt ausführen? (Tag erreicht und im Versandfenster 9 bis 19 Uhr Berlin) */
export function jetztAusfuehren(n: NaechsteStufe | null, now: Date): boolean {
  if (!n || n.faelligAb.getTime() > now.getTime()) return false;
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(now));
  return h >= VERSAND_AB_STUNDE && h < VERSAND_BIS_STUNDE;
}

/** Grund, einen Kunden nicht zu mahnen, oder null. */
export function mahnStoppGrund(c: { mahnStopp?: boolean | null; isTest?: boolean | null } | null | undefined): string | null {
  if (!c) return null;
  if (c.isTest) return "Testkunde";
  if (c.mahnStopp) return "Mahnungen beim Kunden gestoppt";
  return null;
}

/** Tage seit Fälligkeit (negativ: noch nicht fällig). */
export function tageUeberfaellig(dueDate: Date, now: Date): number {
  const a = Date.parse(`${tagVon(dueDate)}T12:00:00Z`);
  const b = Date.parse(`${berlinTodayIso(now)}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** YYYY-MM-DD → gespeichertes Datum (12:00 UTC des Berliner Tages). */
export const tagDatum = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
export const fmtTag = (iso: string) => iso.split("-").reverse().join(".");
export const fmtDatum = (d: Date) => fmtTag(tagVon(d));
export const eurCent = (cents: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);

// ─── Texte (Sie-Form, ohne Gedankenstriche, Absender Ole Kannapinn) ──────────

export type MahnText = { subject: string; paragraphs: string[]; button: string };
export type TextInput = { nummer: string; betragCent: number; dueDate: Date; art: string; now: Date };

const ZWECK = "Geben Sie als Verwendungszweck bitte die Rechnungsnummer an, dann ordnen wir Ihre Zahlung automatisch zu.";
const UEBERSCHNITTEN = "Falls sich das mit Ihrer Zahlung überschnitten hat, betrachten Sie diese Nachricht bitte als gegenstandslos.";

/** Text je Stufe. Stufe 5 („Kunde anrufen“) ist eine Aufgabe für Ole, keine Mail. */
export function mahnText(key: Exclude<StufeKey, "anruf">, i: TextInput): MahnText {
  const nr = i.nummer;
  const betrag = eurCent(i.betragCent);
  const faellig = fmtDatum(i.dueDate);
  const frist = fmtTag(addDaysIso(berlinTodayIso(i.now), 7));
  const ueberweisung = i.art === "ueberweisung";
  switch (key) {
    case "erinnerung":
      return {
        subject: `Erinnerung: Rechnung ${nr} ist am ${faellig} fällig`,
        paragraphs: [
          `eine kurze Erinnerung: Unsere Rechnung ${nr} über ${betrag} ist am ${faellig} fällig.`,
          `Bitte überweisen Sie den Betrag an die IBAN auf der Rechnung. ${ZWECK}`,
          "Haben Sie schon überwiesen? Dann ist alles erledigt, vielen Dank.",
        ],
        button: "Rechnung ansehen",
      };
    case "faellig":
      return ueberweisung
        ? {
            subject: `Zahlungserinnerung: Rechnung ${nr}`,
            paragraphs: [
              `heute ist unsere Rechnung ${nr} über ${betrag} fällig. Bei uns ist noch keine Zahlung eingegangen.`,
              `Bitte überweisen Sie den Betrag in den nächsten Tagen an die IBAN auf der Rechnung. ${ZWECK}`,
              UEBERSCHNITTEN,
            ],
            button: "Rechnung ansehen und bezahlen",
          }
        : {
            subject: `Zahlung nicht erfolgreich: Rechnung ${nr}`,
            paragraphs: [
              `leider hat die Abbuchung für unsere Rechnung ${nr} über ${betrag} nicht geklappt. Das passiert zum Beispiel, wenn das Konto gerade nicht gedeckt ist oder die Karte abgelaufen ist.`,
              "Über den Knopf können Sie die Rechnung direkt online bezahlen. Dort können Sie auch eine andere Zahlungsart wählen.",
              UEBERSCHNITTEN,
            ],
            button: "Rechnung jetzt bezahlen",
          };
    case "mahnung1":
      return {
        subject: `1. Mahnung: Rechnung ${nr}`,
        paragraphs: [
          `unsere Rechnung ${nr} über ${betrag}, fällig am ${faellig}, ist leider noch offen. Die Rechnung finden Sie im Anhang.`,
          `Bitte begleichen Sie den Betrag bis zum ${frist}.${ueberweisung ? ` ${ZWECK}` : ""}`,
          "Gibt es einen Grund, warum Sie noch nicht zahlen konnten? Antworten Sie einfach auf diese E-Mail, dann finden wir gemeinsam eine Lösung.",
          UEBERSCHNITTEN,
        ],
        button: "Rechnung ansehen und bezahlen",
      };
    case "mahnung2":
      return {
        subject: `2. Mahnung: Rechnung ${nr}`,
        paragraphs: [
          `unsere Rechnung ${nr} über ${betrag}, fällig am ${faellig}, ist trotz Zahlungserinnerung und 1. Mahnung noch offen. Die Rechnung finden Sie noch einmal im Anhang.`,
          `Bitte begleichen Sie den Betrag bis spätestens ${frist}.${ueberweisung ? ` ${ZWECK}` : ""}`,
          "Wenn Sie Fragen zur Rechnung haben oder eine andere Lösung besprechen möchten, antworten Sie auf diese E-Mail oder rufen Sie mich an.",
          UEBERSCHNITTEN,
        ],
        button: "Rechnung ansehen und bezahlen",
      };
  }
}

/** Aufgabe auf Admin „Heute“ (Stufe 5). */
export function anrufAufgabe(i: { kunde: string; nummer: string; betragCent: number; dueDate: Date }): { title: string; note: string } {
  return {
    title: `Kunde anrufen: ${i.kunde}`,
    note: `Rechnung ${i.nummer} über ${eurCent(i.betragCent)} ist seit ${fmtDatum(i.dueDate)} fällig und noch offen. Zahlungserinnerung, 1. und 2. Mahnung sind verschickt. Bitte anrufen und klären; bei einer Absprache in der Kundenakte unter Abrechnung die Mahnungen stoppen.`,
  };
}

// WhatsApp-Vorlagen (UTILITY, Support-Nummer, Sie-Form, Absender Ole Kannapinn). NUR VORBEREITET, nicht
// eingereicht (Ole, 17.11.2026): Zum Einreichen in SUPPORT_TEMPLATES (lib/vertrieb/termin-whatsapp.ts) aufnehmen.
// Bis zur Freigabe bei Meta geht am Fälligkeitstag nur die E-Mail raus.
export const RECHNUNG_TEMPLATE_PURPOSE = "rechnung_zahlung";
export const RECHNUNG_FAELLIG_TEMPLATE = "pg_rechnung_faellig_sie_v1";
export const RECHNUNG_FEHLGESCHLAGEN_TEMPLATE = "pg_rechnung_fehlgeschlagen_sie_v1";
export const RECHNUNG_FAELLIG_BODY =
  "Guten Tag {{1}}, eine kurze Erinnerung: Unsere Rechnung {{2}} über {{3}} ist heute fällig, bei uns ist noch keine Zahlung eingegangen. " +
  "Hier können Sie die Rechnung ansehen und bezahlen: {{4}} Falls sich das mit Ihrer Zahlung überschnitten hat, ist alles in Ordnung. " +
  "Bei Fragen antworten Sie einfach auf diese Nachricht. Viele Grüße, Ole Kannapinn";
export const RECHNUNG_FEHLGESCHLAGEN_BODY =
  "Guten Tag {{1}}, leider hat die Abbuchung für unsere Rechnung {{2}} über {{3}} nicht geklappt. " +
  "Hier können Sie die Rechnung direkt bezahlen, auch mit einer anderen Zahlungsart: {{4}} " +
  "Bei Fragen antworten Sie einfach auf diese Nachricht. Viele Grüße, Ole Kannapinn";
export const RECHNUNG_TEMPLATE_EXAMPLES = ["Herr Mustermann", "PG-1234-0007", "1.190,00 €", "https://invoice.stripe.com/i/beispiel"];
export const MAHN_VORLAGEN_VORBEREITET = [
  { name: RECHNUNG_FAELLIG_TEMPLATE, body: RECHNUNG_FAELLIG_BODY, examples: RECHNUNG_TEMPLATE_EXAMPLES, purpose: RECHNUNG_TEMPLATE_PURPOSE },
  { name: RECHNUNG_FEHLGESCHLAGEN_TEMPLATE, body: RECHNUNG_FEHLGESCHLAGEN_BODY, examples: RECHNUNG_TEMPLATE_EXAMPLES, purpose: RECHNUNG_TEMPLATE_PURPOSE },
] as const;

export function rechnungVorlage(art: string): { name: string; body: string } {
  return art === "ueberweisung"
    ? { name: RECHNUNG_FAELLIG_TEMPLATE, body: RECHNUNG_FAELLIG_BODY }
    : { name: RECHNUNG_FEHLGESCHLAGEN_TEMPLATE, body: RECHNUNG_FEHLGESCHLAGEN_BODY };
}

// ─── Bankabgleich (Eingang auf dem Geschäftskonto) ───────────────────────

/** Für den Vergleich: nur Buchstaben und Ziffern, groß geschrieben (Banken trennen Nummern unterschiedlich). */
export const normNummer = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export type AbgleichFall = { id: string; amountDue: number; invoiceNumber: string | null; kunde?: string | null };
export type AbgleichErgebnis = { eindeutig: string | null; vorschlaege: { id: string; grund: string }[] };

const namensTreffer = (kunde: string | null | undefined, text: string) => {
  const woerter = (kunde ?? "")
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((w) => w.length >= 4 && !["gmbh", "versicherung", "versicherungen", "agentur", "büro", "buero", "generalagentur"].includes(w));
  const t = text.toLowerCase();
  return woerter.some((w) => t.includes(w));
};

/**
 * Eingang (Betrag in Euro, positiv) gegen offene Fälle: Eindeutig, wenn genau ein Fall Betrag UND Rechnungsnummer
 * trifft. Sonst Vorschläge zur Bestätigung im Admin: Rechnungsnummer passt (Betrag abweichend) oder Betrag passt
 * und der Kundenname steht in Auftraggeber bzw. Verwendungszweck oder nur ein offener Fall hat genau diesen Betrag.
 */
export function bankAbgleich(tx: { amount: number; purpose?: string | null; counterparty?: string | null }, faelle: AbgleichFall[]): AbgleichErgebnis {
  const out: AbgleichErgebnis = { eindeutig: null, vorschlaege: [] };
  if (!(tx.amount > 0)) return out;
  const cents = Math.round(tx.amount * 100);
  const text = `${tx.purpose ?? ""} ${tx.counterparty ?? ""}`;
  const textNorm = normNummer(text);
  const betragGleich = faelle.filter((f) => f.amountDue === cents);
  const nummer = (f: AbgleichFall) => {
    const n = normNummer(f.invoiceNumber);
    return n.length >= 6 && textNorm.includes(n);
  };
  const beides = faelle.filter((f) => f.amountDue === cents && nummer(f));
  if (beides.length === 1) return { eindeutig: beides[0].id, vorschlaege: [] };
  for (const f of faelle) {
    const nr = nummer(f);
    const betrag = f.amountDue === cents;
    if (nr && betrag) out.vorschlaege.push({ id: f.id, grund: "Betrag und Rechnungsnummer passen, aber mehrere Rechnungen kommen infrage" });
    else if (nr) out.vorschlaege.push({ id: f.id, grund: `Rechnungsnummer passt, Betrag weicht ab (${eurCent(cents)} statt ${eurCent(f.amountDue)})` });
    else if (betrag && (namensTreffer(f.kunde, text) || betragGleich.length === 1)) {
      out.vorschlaege.push({ id: f.id, grund: namensTreffer(f.kunde, text) ? "Betrag und Name passen, Rechnungsnummer fehlt" : "Betrag passt, Rechnungsnummer fehlt" });
    }
  }
  return out;
}
