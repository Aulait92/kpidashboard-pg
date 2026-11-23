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
// - A/B-Test (A/B-Test-Labor, Freigabe Ole 22.11.2026, Lernbuch docs/firma/ab-tests.md): Fassung fest je Kontakt
//   (neFassung), vermerkt im Verlaufseintrag (note „Fassung A“ bzw. „Fassung B“), Auswertung nichtErreichtAbStand.
// - Im Fenster wählbar (Ole, 23.11.2026): Du/Sie und ein bearbeiteter Mailtext. Bearbeitete Sendungen werden vermerkt
//   („Fassung A, bearbeitet“) und zählen nicht im A/B-Test.

import { createHash } from "node:crypto";
import { decideAbWinner, zTest, type AbDecision } from "@/lib/whatsapp/ab-test";
import { a, type Ansprache } from "@/lib/ansprache";

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

// ─── Texte (Sie- und Du-Form, ohne Gedankenstriche, Absender Ole) ─────────
// Du/Sie wählt Ole im Fenster „Eintragen“ (Ole, 23.11.2026), Standard: wie der Kontakt sonst angesprochen wird
// (neDuStandard). Beide Formen haben dieselben Fassungen A und B; die Form zählt nicht als eigene Testgröße.

export type NichtErreichtMail = { subject: string; paragraphs: string[]; button: { label: string; url: string } | null };

export function nichtErreichtMail(o: { buchungslink: string | null; fassung?: NeFassung; du?: boolean }): NichtErreichtMail {
  const b = o.fassung === "b";
  const an: Ansprache = o.du ? "du" : "sie";
  return {
    subject: a(an, "Ich habe dich gerade nicht erreicht", "Ich habe Sie gerade nicht erreicht"),
    paragraphs: [
      a(an, "ich habe eben versucht, dich anzurufen, leider ohne Erfolg.", "ich habe eben versucht, Sie anzurufen, leider ohne Erfolg."),
      o.buchungslink
        ? b
          ? a(
              an,
              "Such dir gern direkt einen passenden Termin für ein kurzes Gespräch von 15 Minuten aus. Oder antworte mir kurz: Erreiche ich dich besser vormittags oder nachmittags?",
              "Suchen Sie sich gern direkt einen passenden Termin für ein kurzes Gespräch von 15 Minuten aus. Oder antworten Sie mir kurz: Erreiche ich Sie besser vormittags oder nachmittags?",
            )
          : a(
              an,
              "Such dir gern direkt einen passenden Termin für ein kurzes Gespräch von 15 Minuten aus. Oder antworte mir mit einer Zeit, zu der ich dich gut erreiche.",
              "Suchen Sie sich gern direkt einen passenden Termin für ein kurzes Gespräch von 15 Minuten aus. Oder antworten Sie mir mit einer Zeit, zu der ich Sie gut erreiche.",
            )
        : b
          ? a(
              an,
              "Antworte mir gern kurz: Erreiche ich dich besser vormittags oder nachmittags? Dann rufe ich dich zu dieser Zeit zurück.",
              "Antworten Sie mir gern kurz: Erreiche ich Sie besser vormittags oder nachmittags? Dann rufe ich Sie zu dieser Zeit zurück.",
            )
          : a(
              an,
              "Antworte mir gern mit einer Zeit, zu der ich dich gut erreiche, dann rufe ich dich zurück.",
              "Antworten Sie mir gern mit einer Zeit, zu der ich Sie gut erreiche, dann rufe ich Sie zurück.",
            ),
    ],
    button: o.buchungslink ? { label: "Termin aussuchen", url: o.buchungslink } : null,
  };
}

/**
 * Bearbeitbarer Mailtext im Fenster (Ole, 23.11.2026): Anrede und Absätze, getrennt durch Leerzeilen. Der Knopf
 * „Termin aussuchen“ mit dem Buchungslink ist nicht Teil des Textes und steht immer darunter (so kann der Link beim
 * Bearbeiten nicht verloren gehen oder kaputtgehen).
 */
export function neMailText(greeting: string, paragraphs: string[]): string {
  return [greeting, ...paragraphs].join("\n\n");
}

/** Rückweg: erster Block = Anrede, Rest = Absätze (mehrere Leerzeilen zählen als eine). */
export function neMailAusText(text: string): { greeting: string; paragraphs: string[] } {
  const bloecke = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  return { greeting: bloecke[0] ?? "", paragraphs: bloecke.slice(1) };
}

const normal = (t: string) =>
  t
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((z) => z.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Wurde der Text gegenüber dem Vorschlag geändert? Leerzeichen am Zeilenrand und zusätzliche Leerzeilen zählen nicht. */
export function neBearbeitet(vorschlag: { betreff: string; text: string }, eingabe: { betreff?: string | null; text?: string | null }): boolean {
  const betreff = eingabe.betreff?.trim();
  const text = eingabe.text?.trim();
  return (!!betreff && normal(betreff) !== normal(vorschlag.betreff)) || (!!text && normal(text) !== normal(vorschlag.text));
}

// WhatsApp-Vorlage der Support-Nummer (Einreichung im WhatsApp-Cron mit SUPPORT_TEMPLATES, lib/vertrieb/termin-whatsapp.ts).
// Kein Punkt direkt hinter dem Link.
export const NE_TEMPLATE_PURPOSE = "vertrieb_nicht_erreicht";
export const NE_TEMPLATE_NAME = "pg_vertrieb_nicht_erreicht_v1";
export const NE_TEMPLATE_BODY =
  "Guten Tag {{1}}, hier ist Ole Kannapinn von performancegrowth. Ich habe eben versucht, Sie anzurufen. " +
  "Hier können Sie sich direkt einen passenden Termin aussuchen: {{2}} Oder schreiben Sie mir einfach, wann ich Sie gut erreiche.";
export const NE_TEMPLATE_EXAMPLES = ["Herr Mustermann", "https://app.performancegrowth.de/termin/erstgespraech"];

// Fassung B (A/B-Test-Labor 22.11.2026): genau eine Änderung, die offene Bitte „wann ich Sie gut erreiche“ wird zur
// Entweder-oder-Frage, die sich mit einem Wort beantworten lässt. Gleicher Anfang, gleicher Link an gleicher Stelle,
// endet mit dem Fragezeichen (nicht mit der Variablen).
export const NE_TEMPLATE_NAME_B = "pg_vertrieb_nicht_erreicht_b_v1";
export const NE_TEMPLATE_BODY_B =
  "Guten Tag {{1}}, hier ist Ole Kannapinn von performancegrowth. Ich habe eben versucht, Sie anzurufen. " +
  "Hier können Sie sich direkt einen passenden Termin aussuchen: {{2}} Oder antworten Sie kurz: Erreiche ich Sie besser vormittags oder nachmittags?";

// Du-Fassungen der Vorlagen (Ole, 23.11.2026: Du/Sie im Fenster wählbar). Gleicher Wortlaut wie A bzw. B, nur in
// Du-Form. Eingereicht mit den übrigen Vorlagen der Support-Nummer; bis Meta sie freigibt, geht die WhatsApp auch bei
// Du in Sie-Form raus (Hinweis im Fenster), die Mail in Du-Form.
export const NE_TEMPLATE_NAME_DU = "pg_vertrieb_nicht_erreicht_du_v1";
export const NE_TEMPLATE_BODY_DU =
  "Hallo {{1}}, hier ist Ole Kannapinn von performancegrowth. Ich habe eben versucht, dich anzurufen. " +
  "Hier kannst du dir direkt einen passenden Termin aussuchen: {{2}} Oder schreib mir einfach, wann ich dich gut erreiche.";
export const NE_TEMPLATE_NAME_B_DU = "pg_vertrieb_nicht_erreicht_b_du_v1";
export const NE_TEMPLATE_BODY_B_DU =
  "Hallo {{1}}, hier ist Ole Kannapinn von performancegrowth. Ich habe eben versucht, dich anzurufen. " +
  "Hier kannst du dir direkt einen passenden Termin aussuchen: {{2}} Oder antworte kurz: Erreiche ich dich besser vormittags oder nachmittags?";
export const NE_TEMPLATE_EXAMPLES_DU = ["Max", "https://app.performancegrowth.de/termin/erstgespraech"];

/** Vorlage je Fassung und Form. */
export function neVorlage(fassung: NeFassung, du: boolean): { name: string; body: string } {
  if (fassung === "b") return du ? { name: NE_TEMPLATE_NAME_B_DU, body: NE_TEMPLATE_BODY_B_DU } : { name: NE_TEMPLATE_NAME_B, body: NE_TEMPLATE_BODY_B };
  return du ? { name: NE_TEMPLATE_NAME_DU, body: NE_TEMPLATE_BODY_DU } : { name: NE_TEMPLATE_NAME, body: NE_TEMPLATE_BODY };
}

// ─── A/B-Test „Nicht erreicht“ ──────────────────────────────────────────

export type NeFassung = "a" | "b";
export const NE_AB_TEST = "vertrieb_nicht_erreicht";
/**
 * Mindestmenge je Fassung (Kontakte mit erster „Nicht erreicht“-Nachricht): 50 wie der Standard der Vorlagen-Tests.
 * Ole ruft selbst an, erwartet sind etwa 5 bis 15 Fälle je Woche; 150 (Erstanschreiben) wären erst nach über einem
 * Jahr erreicht. Dazu wie immer p < 0,01 und je Fassung 10 Treffer und 10 Nicht-Treffer (decideAbWinner).
 */
export const NE_MIN_JE_FASSUNG = 50;
export const NE_FENSTER_STUNDEN = 72;
/** Nach der Entscheidung hier den Gewinner eintragen (alle bekommen ihn), bis dahin null = Test läuft. */
export const NE_GEWINNER: NeFassung | null = null;

/** Feste Fassung je Kontakt (SHA-256 aus Test und contactId), unabhängig von den übrigen Tests. */
export function neZuteilung(contactId: string): NeFassung {
  return createHash("sha256").update(`ne:${NE_AB_TEST}:${contactId}`).digest()[0] % 2 === 0 ? "a" : "b";
}

/**
 * Fassung für diese Sendung. Ist B zugeteilt, die WhatsApp-Vorlage B aber noch nicht freigegeben, während A es ist,
 * gilt A (Rückfall), damit beide Fassungen dieselbe Kanal-Mischung haben; ausgewertet wird die vermerkte Fassung.
 */
export function neFassung(contactId: string, vorlage: { a: boolean; b: boolean }): NeFassung {
  if (NE_GEWINNER) return NE_GEWINNER;
  const f = neZuteilung(contactId);
  return f === "b" && !vorlage.b && vorlage.a ? "a" : f;
}

/**
 * Vermerk im Verlaufseintrag (SalesActivity.note) und Rücklesen: „Fassung A“, mit Zusätzen „, Du“ (Du-Form) und
 * „, bearbeitet“ (Mailtext im Fenster geändert, Ole 23.11.2026). Bearbeitete Sendungen zählen nicht im A/B-Test.
 */
export const neFassungVermerk = (f: NeFassung, o: { du?: boolean; bearbeitet?: boolean } = {}) =>
  `Fassung ${f.toUpperCase()}${o.du ? ", Du" : ""}${o.bearbeitet ? ", bearbeitet" : ""}`;
const VERMERK = /\bFassung ([AB])\b((?:, (?:Du|bearbeitet)\b)*)/;
export function neFassungAusNotiz(note: string | null | undefined): NeFassung | null {
  const m = VERMERK.exec(note ?? "");
  return m ? (m[1].toLowerCase() as NeFassung) : null;
}
export function neBearbeitetAusNotiz(note: string | null | undefined): boolean {
  const m = VERMERK.exec(note ?? "");
  return !!m && m[2].includes("bearbeitet");
}

/** Eine Einheit = ein Kontakt mit seiner ersten vermerkten „Nicht erreicht“-Nachricht. */
export type NeEinheit = {
  fassung: NeFassung;
  gesendet: Date;
  antworten: Date[];
  termine: Date[];
  /** Erste Nachricht mit bearbeitetem Text: zählt nicht im Test (sauberer Vergleich A gegen B) */
  bearbeitet?: boolean;
};
export type NeFassungStand = { n: number; treffer: number; termin: number };
export type NeAbStand = {
  a: NeFassungStand;
  b: NeFassungStand;
  /** Noch keine 72 Stunden alt, zählen noch nicht */
  unreif: number;
  /** Mit bearbeitetem Text gesendet, zählen nie */
  bearbeitet: number;
  quoteA: number;
  quoteB: number;
  p: number;
  terminQuoteA: number;
  terminQuoteB: number;
  terminP: number;
  entscheidung: AbDecision;
};

/**
 * Auswertung (rein): Treffer = Antwort (Mail oder WhatsApp) oder Termin gebucht innerhalb von 72 Stunden nach der
 * ersten Nachricht; Terminquote (nur Termin, gleiches Fenster) zum Ansehen. Entscheidung nur über die Treffer.
 */
export function nichtErreichtAbStand(einheiten: NeEinheit[], now: Date): NeAbStand {
  const fenster = NE_FENSTER_STUNDEN * 3_600_000;
  const leer = (): NeFassungStand => ({ n: 0, treffer: 0, termin: 0 });
  const s = { a: leer(), b: leer() };
  let unreif = 0;
  let bearbeitet = 0;
  for (const e of einheiten) {
    if (e.bearbeitet) {
      bearbeitet++;
      continue;
    }
    const t0 = e.gesendet.getTime();
    if (now.getTime() - t0 < fenster) {
      unreif++;
      continue;
    }
    const drin = (d: Date) => d.getTime() >= t0 && d.getTime() <= t0 + fenster;
    const termin = e.termine.some(drin);
    const x = s[e.fassung];
    x.n++;
    if (termin || e.antworten.some(drin)) x.treffer++;
    if (termin) x.termin++;
  }
  const t = zTest({ sent: s.a.n, replied: s.a.treffer }, { sent: s.b.n, replied: s.b.treffer });
  const tt = zTest({ sent: s.a.n, replied: s.a.termin }, { sent: s.b.n, replied: s.b.termin });
  return {
    ...s,
    unreif,
    bearbeitet,
    quoteA: t.rateA,
    quoteB: t.rateB,
    p: t.p,
    terminQuoteA: tt.rateA,
    terminQuoteB: tt.rateB,
    terminP: tt.p,
    entscheidung: decideAbWinner({ a: { sent: s.a.n, replied: s.a.treffer }, b: { sent: s.b.n, replied: s.b.treffer } }, { min: NE_MIN_JE_FASSUNG }),
  };
}
