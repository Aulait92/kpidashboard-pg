// Pay-per-Lead + Software, Variante „Kampagnen im eigenen Werbekonto“ (Ole, 20.11.2026). Reine Funktionen ohne
// Datenbank, gemeinsam für Admin-Formular, Angebotsseite, Annahme, Auftragsbestätigung, Angebotsmail, Präsentation
// und Tests. Beschlüsse: docs/firma/protokolle/2026-11-20-ppl-im-kundenkonto.md, Entscheidungslog 20.11.2026,
// Steuer: docs/recht/ust-ppl-im-kundenkonto-2026-11-20.md (unsere Vergütung mit 19 % USt., nicht § 4 Nr. 11).
//
// Mechanik: Die Kampagnen laufen im Meta-Werbekonto des Kunden (Partnerzugriff für uns), er zahlt Meta direkt.
// Wir rechnen wöchentlich per Lastschrift ab: Leads der Vorwoche × Preis je Lead (Endpreis brutto, Obergrenze)
// abzüglich seiner Meta-Kosten derselben Woche (inkl. USt. nach § 13b). Keine Margenzeile.
//
// Startpaket (Ole, 20.11.2026, ersetzt „Software inklusive ab 1.750 € Leadumsatz im Monat“): Die Variante gibt es nur
// mit einer Startmenge von mindestens {@link MINDESTBESTELLUNG_KUNDENKONTO} € Leadumsatz (brutto). Die Startmenge ist
// eine Abnahmezusage, keine Vorauszahlung; abgerechnet wird weiter wöchentlich nach gelieferten Leads.
// Software ist inklusive, solange der Kunde mindestens 1.500 € Leadumsatz im Kalendermonat abnimmt (sonst Listenpreis);
// auf der Rechnung steht sie trotzdem als eigene Position (Software-Umsatz), der Leadteil sinkt entsprechend.
//
// Keine Gedankenstriche in den Texten (gehen an Interessenten), nie „Garantie“, kein Ergebnisversprechen.

import { eurCent } from "@/lib/ppl/erste-woche-shared";

/** Variante am Angebot (Offer.pplModell): null/„pool“ = bisher (Leads aus unserem Pool), „kundenkonto“ = neu. */
export type PplModell = "pool" | "kundenkonto";
export const PPL_MODELL_KUNDENKONTO = "kundenkonto" as const;
export const normalizePplModell = (v: unknown): PplModell => (v === PPL_MODELL_KUNDENKONTO ? PPL_MODELL_KUNDENKONTO : "pool");

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mindestbestellung zum Start: Summe aus Startmenge × Preis je Lead (brutto), Ole 20.11.2026. */
export const MINDESTBESTELLUNG_KUNDENKONTO = 1500;

/**
 * Software inklusive (Ole, 20.11.2026): nur, solange der Kunde im Kalendermonat mindestens
 * {@link MINDESTBESTELLUNG_KUNDENKONTO} € Leadumsatz (brutto, Leads × Preis) abnimmt; liegt ein Monat darunter, kostet die
 * Software in diesem Monat regulär den Listenpreis. Gleiche Schwelle wie die Mindestbestellung zum Start.
 */
export const softwareInklusive = (leadumsatzMonatBrutto: number): boolean =>
  Number.isFinite(leadumsatzMonatBrutto) && round2(leadumsatzMonatBrutto) >= MINDESTBESTELLUNG_KUNDENKONTO;

/** Umsatzsteuer auf unsere Vergütung in dieser Variante (nicht nach § 4 Nr. 11 befreit). */
export const UST_KUNDENKONTO = 0.19;

/** Vorschläge im Formular: Preis je Lead brutto (frei änderbar). */
export const KUNDENKONTO_VORSCHLAEGE: readonly { name: string; preis: number }[] = [
  { name: "Privatschutz", preis: 35 },
  { name: "Kindersparplan", preis: 65 },
];

export const KUNDENKONTO_PREIS_MAX = 1000;
export const KUNDENKONTO_MENGE_MAX = 5000;

/** Produkt der Variante: Name, Preis je Lead (Endpreis brutto inkl. USt., Obergrenze) und Startmenge. */
export type KundenkontoProdukt = { name: string; preis: number; menge: number };

export type KundenkontoAngebot = { produkte: KundenkontoProdukt[]; startUmsatz: number };

/** Startmenge, mit der ein einzelnes Produkt die Mindestbestellung erreicht (z. B. 35 € → 43 Leads). */
export const startMengeFuer = (preis: number): number => (preis > 0 ? Math.ceil(MINDESTBESTELLUNG_KUNDENKONTO / preis) : 0);

/** Leadumsatz der Startmenge (brutto). */
export const startUmsatz = (produkte: readonly Pick<KundenkontoProdukt, "preis" | "menge">[]): number =>
  round2(produkte.reduce((s, p) => s + p.preis * p.menge, 0));

/** Produkte aus Offer.pplProdukte (Json); Unbrauchbares fällt weg. */
export function kundenkontoProdukteAus(raw: unknown): KundenkontoProdukt[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((p) => {
    const r = (p ?? {}) as { name?: unknown; preis?: unknown; menge?: unknown };
    const name = typeof r.name === "string" ? r.name.trim() : "";
    const preis = Number(r.preis);
    const menge = Math.round(Number(r.menge));
    return name && Number.isFinite(preis) && preis > 0 && Number.isFinite(menge) && menge > 0 ? [{ name, preis: round2(preis), menge }] : [];
  });
}

/** Ist das Angebot die Variante „Kampagnen im eigenen Werbekonto“? */
export const istKundenkonto = (o: { package?: string | null; pplModell?: string | null }): boolean =>
  o.package === "ppl_software" && o.pplModell === PPL_MODELL_KUNDENKONTO;

/** Variante aus einem Angebot (null = nicht diese Variante). */
export function kundenkontoAus(o: { package?: string | null; pplModell?: string | null; pplProdukte?: unknown }): KundenkontoAngebot | null {
  if (!istKundenkonto(o)) return null;
  const produkte = kundenkontoProdukteAus(o.pplProdukte);
  return { produkte, startUmsatz: startUmsatz(produkte) };
}

/**
 * Eingabe prüfen (Formular und Server): mindestens ein Produkt, Name, Preis je Lead über 0, Startmenge ganzzahlig ab 1,
 * keine doppelten Produkte, Summe mindestens {@link MINDESTBESTELLUNG_KUNDENKONTO} €.
 */
export function pruefeKundenkontoProdukte(
  raw: readonly { name?: unknown; preis?: unknown; menge?: unknown }[] | null | undefined,
): { ok: true; produkte: KundenkontoProdukt[]; startUmsatz: number } | { ok: false; error: string } {
  const zeilen = (raw ?? []).filter((p) => String(p?.name ?? "").trim() || String(p?.preis ?? "").trim() || String(p?.menge ?? "").trim());
  if (zeilen.length === 0) return { ok: false, error: "Bitte mindestens ein Produkt mit Preis je Lead angeben." };
  const produkte: KundenkontoProdukt[] = [];
  for (const z of zeilen) {
    const name = String(z.name ?? "").trim().slice(0, 120);
    if (!name) return { ok: false, error: "Bitte jedem Produkt einen Namen geben." };
    const preis = Number(String(z.preis ?? "").replace(",", "."));
    if (!Number.isFinite(preis) || preis <= 0 || preis > KUNDENKONTO_PREIS_MAX) return { ok: false, error: `Bitte für ${name} einen Preis je Lead angeben.` };
    const mengeRoh = Number(String(z.menge ?? "").replace(",", "."));
    if (!Number.isInteger(mengeRoh) || mengeRoh < 1 || mengeRoh > KUNDENKONTO_MENGE_MAX) return { ok: false, error: `Bitte für ${name} eine Startmenge angeben (ganze Leads).` };
    if (produkte.some((p) => p.name.toLowerCase() === name.toLowerCase())) return { ok: false, error: `${name} steht doppelt in der Liste.` };
    produkte.push({ name, preis: round2(preis), menge: mengeRoh });
  }
  const summe = startUmsatz(produkte);
  if (summe < MINDESTBESTELLUNG_KUNDENKONTO) {
    return { ok: false, error: `Das Startpaket braucht mindestens ${eurCent(MINDESTBESTELLUNG_KUNDENKONTO)} Leadumsatz, bisher ${eurCent(summe)}.` };
  }
  return { ok: true, produkte, startUmsatz: summe };
}

// ─── Abrechnung (Rechenregeln für die spätere wöchentliche Lastschrift; der Lauf selbst ist noch nicht gebaut) ─────

/**
 * Eine Abrechnungswoche: Leads × Preis abzüglich der Meta-Kosten derselben Woche (brutto inkl. § 13b). Liegt der
 * rechnerische Preis über der Obergrenze (Meta teurer als Leads × Preis), entsteht eine Gutschrift. Sie wird nur mit
 * der Vergütung desselben Abrechnungsmonats verrechnet (`gutschriftVorher`), nie ausgezahlt.
 */
export function wochenAbrechnung(w: {
  leads: readonly { preis: number; anzahl: number }[];
  metaKostenBrutto: number;
  /** Offene Gutschrift aus früheren Wochen desselben Monats (am Monatsende verfällt der Rest). */
  gutschriftVorher?: number;
}): { leadUmsatz: number; meta: number; betrag: number; gutschriftDanach: number } {
  const leadUmsatz = round2(w.leads.reduce((s, l) => s + l.preis * Math.max(0, Math.round(l.anzahl)), 0));
  const meta = round2(Math.max(0, w.metaKostenBrutto));
  const roh = round2(leadUmsatz - meta - Math.max(0, w.gutschriftVorher ?? 0));
  return { leadUmsatz, meta, betrag: Math.max(0, roh), gutschriftDanach: roh < 0 ? round2(-roh) : 0 };
}

/**
 * Software auf der Monatsrechnung (Ole, 20.11.2026). Inklusive ({@link softwareInklusive}, Leadumsatz im Monat ab
 * 1.500 € brutto): Von unserer Vergütung (brutto) entfällt der Software-Listenpreis auf die eigene Position „Software“
 * (Software-Umsatz), der Leadteil sinkt um denselben Betrag; reicht die Vergütung dafür nicht, wird nur bis zur Höhe der
 * Vergütung umgebucht. Darunter: Software zusätzlich zum Listenpreis, Leadteil = ganze Vergütung. Alles mit 19 % USt.
 */
export function rechnungsPositionen(a: { verguetungBrutto: number; leadumsatzMonatBrutto: number; softwareNetto: number }) {
  const brutto = round2(Math.max(0, a.verguetungBrutto));
  const softwareBrutto = round2(a.softwareNetto * (1 + UST_KUNDENKONTO));
  const inklusive = softwareInklusive(a.leadumsatzMonatBrutto);
  const softwareAnteil = inklusive ? Math.min(brutto, softwareBrutto) : softwareBrutto;
  const leadteilBrutto = inklusive ? round2(brutto - softwareAnteil) : brutto;
  return {
    inklusive,
    software: { netto: round2(softwareAnteil / (1 + UST_KUNDENKONTO)), brutto: softwareAnteil },
    leadteil: { netto: round2(leadteilBrutto / (1 + UST_KUNDENKONTO)), brutto: leadteilBrutto },
    /** Abzubuchen im Monat (brutto): inklusive = Vergütung, sonst Vergütung + Software */
    gesamtBrutto: round2(leadteilBrutto + softwareAnteil),
  };
}

// ─── Texte (Sie-Form bzw. Du für die Mail, ohne Gedankenstriche) ──────────────────────────────────────────────────

/** „Privatschutz 35,00 €, Kindersparplan 65,00 €“ */
export const preisListeText = (produkte: readonly Pick<KundenkontoProdukt, "name" | "preis">[]): string =>
  produkte.map((p) => `${p.name} ${eurCent(p.preis)}`).join(", ");

/** „43 Leads Privatschutz und 10 Leads Kindersparplan“ */
export const startMengeText = (produkte: readonly Pick<KundenkontoProdukt, "name" | "menge">[]): string => {
  const teile = produkte.map((p) => `${p.menge} Leads ${p.name}`);
  return teile.length > 1 ? `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}` : (teile[0] ?? "");
};

export const KUNDENKONTO_NAME = "Kampagnen im eigenen Werbekonto";
export const KUNDENKONTO_WERBEKONTO = "Die Werbung läuft über Ihr eigenes Meta-Werbekonto, wir arbeiten darin mit Partnerzugriff.";
export const KUNDENKONTO_BUDGET = "Das Werbebudget zahlen Sie direkt an Meta, es wird voll angerechnet.";
export const KUNDENKONTO_OBERGRENZE =
  "Das ist eine Preisobergrenze: keine Zusage zu Leadzahlen oder Ergebnissen.";
export const KUNDENKONTO_ABRECHNUNG =
  "Abrechnung wöchentlich per Lastschrift: Leads der Vorwoche × Preis je Lead, abzüglich Ihrer Meta-Kosten derselben Woche (inkl. Umsatzsteuer nach § 13b UStG). Unsere Vergütung enthält 19 % USt.";
export const KUNDENKONTO_VORAUSSETZUNG =
  "Voraussetzung: Erlaubnis nach § 34d GewO, für Kindersparplan nach § 34f GewO oder ein Haftungsdach. Als Ausschließlichkeitsvertreter bestätigen Sie mit der Annahme, dass Ihr Versicherer zugestimmt hat.";
export const KUNDENKONTO_BEDINGUNGEN_VERWEIS = `Es gelten die Besonderen Bedingungen „${KUNDENKONTO_NAME}“ in diesem Angebot.`;

/** „Startpaket: 43 Leads Privatschutz, zusammen 1.505,00 € Leadumsatz inkl. USt. …“ */
export const startpaketText = (k: KundenkontoAngebot): string =>
  `Startpaket: ${startMengeText(k.produkte)}, zusammen ${eurCent(k.startUmsatz)} Leadumsatz inkl. USt. (mindestens ${eurCent(MINDESTBESTELLUNG_KUNDENKONTO)}). Abgerechnet wird nach Lieferung, keine Vorauszahlung.`;

/** „Sie zahlen höchstens Privatschutz 35,00 € … je Lead inkl. USt.“ */
export const hoechstpreisText = (produkte: readonly Pick<KundenkontoProdukt, "name" | "preis">[]): string =>
  `Sie zahlen höchstens diesen Preis je Lead inkl. USt.: ${preisListeText(produkte)}.`;

/**
 * Rechenbeispiel für eine Woche mit dem ersten Produkt (kein Ergebnisversprechen): 20 Leads, Meta-Kosten rund 45 %
 * des Leadumsatzes, auf 50 € gerundet. „20 Leads × 35,00 € = 700,00 €. Haben Sie in dieser Woche 300,00 € an Meta
 * gezahlt, buchen wir 400,00 € ab.“
 */
export function beispielRechnung(p: Pick<KundenkontoProdukt, "preis"> | undefined): { leads: number; umsatz: number; meta: number; betrag: number; text: string } | null {
  if (!p || !(p.preis > 0)) return null;
  const leads = 20;
  const umsatz = round2(leads * p.preis);
  const meta = Math.max(50, Math.round((umsatz * 0.45) / 50) * 50);
  const { betrag } = wochenAbrechnung({ leads: [{ preis: p.preis, anzahl: leads }], metaKostenBrutto: meta });
  return {
    leads,
    umsatz,
    meta,
    betrag,
    text: `Rechenbeispiel für eine Woche: ${leads} Leads × ${eurCent(p.preis)} = ${eurCent(umsatz)}. Haben Sie in dieser Woche ${eurCent(meta)} an Meta gezahlt, buchen wir ${eurCent(betrag)} ab.`,
  };
}

/**
 * Punkte „Das vereinbaren Sie mit dem Klick“ und Auftragsbestätigung (vor Software, Laufzeit, Kündigung und Steuer der
 * Software; die Software-Zeile kommt aus {@link kundenkontoSoftwareZeile}). Bewusst wenige Punkte (UX-Regel).
 */
export function kundenkontoVertragszeilen(k: KundenkontoAngebot): string[] {
  return [
    `Paket: Pay-per-Lead + Software, ${KUNDENKONTO_NAME} (Partnerzugriff für uns), ohne Einrichtungsgebühr. ${KUNDENKONTO_BUDGET}`,
    `${hoechstpreisText(k.produkte)} ${KUNDENKONTO_OBERGRENZE}`,
    KUNDENKONTO_ABRECHNUNG,
    startpaketText(k),
    `${KUNDENKONTO_VORAUSSETZUNG} ${KUNDENKONTO_BEDINGUNGEN_VERWEIS}`,
  ];
}

/**
 * Software-Zeile der Variante: inklusive ab 1.500 € Leads im Monat, sonst Listenpreis; abgebucht wie bisher monatlich im
 * Voraus (Software-Abo) und in Monaten mit Software inklusive mit der Leadabrechnung verrechnet.
 */
export const kundenkontoSoftwareZeile = (softwareMonatNetto: number, startText: string | null): string =>
  `Software: inklusive, solange Sie mindestens ${eurCent(MINDESTBESTELLUNG_KUNDENKONTO)} Leads im Monat beziehen, sonst ${eurCent(softwareMonatNetto)} netto im Monat. Abgebucht wird sie monatlich im Voraus${startText ? ` ab ${startText}` : " ab Start"} und in Monaten mit Software inklusive mit Ihrer Leadabrechnung verrechnet.`;

/** Zeile über dem Annahmeknopf statt „Jetzt fällig: 0 €“ (gleiche Form wie bei der ersten Woche). */
export function kundenkontoFaellig(k: KundenkontoAngebot): { label: string; betrag: string; zusatz: string } {
  return { label: "Startpaket: ", betrag: eurCent(k.startUmsatz), zusatz: " Leadumsatz inkl. USt., abgerechnet wöchentlich nach Lieferung, keine Vorauszahlung" };
}

/** Absatz in der Angebotsmail (Sie oder Du). */
export function kundenkontoMailAbsatz(k: KundenkontoAngebot, softwareNetto: number, du: boolean): string {
  const preise = preisListeText(k.produkte);
  const min = eurCent(MINDESTBESTELLUNG_KUNDENKONTO);
  return du
    ? `${KUNDENKONTO_NAME}: Die Werbung läuft über dein eigenes Meta-Werbekonto, das Budget zahlst du direkt an Meta und es wird voll angerechnet. Du zahlst höchstens ${preise} je Lead inkl. USt., abgerechnet wöchentlich per Lastschrift. Startpaket ab ${min} Leadumsatz. Software inklusive, solange du mindestens ${min} Leads im Monat beziehst, sonst ${eurCent(softwareNetto)} netto im Monat.`
    : `${KUNDENKONTO_NAME}: Die Werbung läuft über Ihr eigenes Meta-Werbekonto, das Budget zahlen Sie direkt an Meta und es wird voll angerechnet. Sie zahlen höchstens ${preise} je Lead inkl. USt., abgerechnet wöchentlich per Lastschrift. Startpaket ab ${min} Leadumsatz. Software inklusive, solange Sie mindestens ${min} Leads im Monat beziehen, sonst ${eurCent(softwareNetto)} netto im Monat.`;
}
