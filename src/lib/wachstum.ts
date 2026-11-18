// „Rechnet sich das?“ auf Wachstum (Ole, 18.11.2026): Antwortsatz, Rechnung, Balken und Kennzahlen aus den Zahlen
// von lib/ertrag (gleiche Rechnung wie Monatsbericht und bisherige Karten). Rein, getestet in tests/unit/wachstum.test.ts.
//
// Bestand im Hero = NUR die künftige Bestandsprovision der Verträge aus diesem Zeitraum (Kohorte, 5 Jahre, nach Storno,
// ProvisionSummary.futureTrail). Der Bestand aller bisherigen Verträge (BestandSummary.perYear/inYears) steht nur in den
// Details, damit nicht zwei verschiedene Bestandszahlen nebeneinander stehen.

export type RechnungInput = {
  /** Abschlussprovision im Zeitraum (Makler: Courtage 1. Jahr), schon abzüglich Rückbelastungen (ProvisionSummary.firstYear). */
  provision: number;
  /** Künftiger Bestand der Verträge dieses Zeitraums (5 Jahre, nach Storno). */
  bestand: number;
  /** Alle Kosten im Zeitraum (Leads bzw. Werbebudget, Betreuung, Software). */
  kosten: number;
  /** „Inkl. Bestand (5 Jahre)“ oder „Nur Abschlussprovision“. */
  mitBestand: boolean;
  /** Neue Kunden (erste Verträge im Zeitraum). */
  kunden: number;
  /** Wert pro Kunde aus früheren Zeiträumen, falls im Zeitraum noch kein Kunde (für „X bis Y Abschlüsse“). */
  wertProKundeBisher?: number | null;
};

export type Rechnung = {
  status: "lohnt" | "noch_nicht" | "ohne_kosten";
  /** Provision + (bei mitBestand) Bestand. */
  einnahmen: number;
  ergebnis: number;
  /** Fehlender Betrag bis zum Break-even (0, wenn gedeckt). */
  fehlend: number;
  /** Anteil der Kosten, der schon eingespielt ist (0..1, gedeckelt). */
  gedeckt: number;
  /** Balken: Anteile an der Balkenlänge (Kosten bzw. Einnahmen, je nachdem was größer ist). */
  balken: { provision: number; bestand: number; offen: number };
  /** Überschuss in Prozent der Kosten (nur bei Gewinn). */
  ueberschuss: number | null;
  /** Aus 1 € werden … € (null ohne Kosten). */
  ausEinemEuro: number | null;
  /** Einnahmen ÷ Kunden; ohne Kunden der Wert aus früheren Zeiträumen. */
  wertProKunde: number | null;
  wertAusFrueher: boolean;
  /** „X bis Y Abschlüsse fehlen“ (null, wenn gedeckt oder ohne Wert pro Kunde). */
  abschluesse: { von: number; bis: number } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Spanne der fehlenden Abschlüsse: aufgerundet, X mindestens 1, Y = X + 1. */
export function abschluesseBisBreakEven(fehlend: number, wertProKunde: number | null): { von: number; bis: number } | null {
  if (!(fehlend > 0) || wertProKunde == null || !(wertProKunde > 0)) return null;
  const n = Math.ceil(fehlend / wertProKunde - 1e-9);
  const von = Math.max(1, n - 1);
  return { von, bis: von + 1 };
}

export function rechnetSich(i: RechnungInput): Rechnung {
  const provision = Math.max(0, i.provision);
  const bestand = i.mitBestand ? Math.max(0, i.bestand) : 0;
  const einnahmen = r2(provision + bestand);
  const kosten = Math.max(0, i.kosten);
  const ergebnis = r2(i.provision + (i.mitBestand ? i.bestand : 0) - kosten);
  const wertImZeitraum = i.kunden > 0 ? einnahmen / i.kunden : null;
  const wertProKunde = wertImZeitraum ?? (i.wertProKundeBisher != null && i.wertProKundeBisher > 0 ? i.wertProKundeBisher : null);
  const fehlend = kosten > 0 ? Math.max(0, r2(-ergebnis)) : 0;
  const basis = Math.max(kosten, einnahmen);
  const balken =
    basis > 0
      ? { provision: provision / basis, bestand: bestand / basis, offen: Math.max(0, 1 - einnahmen / basis) }
      : { provision: 0, bestand: 0, offen: 1 };
  return {
    status: kosten <= 0 ? "ohne_kosten" : ergebnis >= 0 ? "lohnt" : "noch_nicht",
    einnahmen,
    ergebnis,
    fehlend,
    gedeckt: kosten > 0 ? Math.min(1, einnahmen / kosten) : 0,
    balken,
    ueberschuss: kosten > 0 && ergebnis > 0 ? ergebnis / kosten : null,
    ausEinemEuro: kosten > 0 ? einnahmen / kosten : null,
    wertProKunde: wertProKunde == null ? null : Math.round(wertProKunde),
    wertAusFrueher: wertImZeitraum == null && wertProKunde != null,
    abschluesse: abschluesseBisBreakEven(fehlend, wertProKunde),
  };
}

const eur0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** „1.261 €“ (ganze Euro). */
export const euro = (n: number) => `${eur0.format(Math.round(n))} €`;
/** „+ 2.618 €“ bzw. „− 1.261 €“ (echtes Minuszeichen, kein Gedankenstrich). */
// Gerundet 0 ohne Vorzeichen-Fehler („+ -0 €“, Ole 18.11.2026)
export const euroMitVorzeichen = (n: number) => {
  const r = Math.round(n);
  return r < 0 ? `− ${euro(-r)}` : r === 0 ? euro(0) : `+ ${euro(r)}`;
};
/** „1,55 €“ */
export const euroCent = (n: number) => `${eur2.format(n)} €`;
/** „74 %“ */
export const prozent = (n: number) => `${eur0.format(Math.round(n * 100))} %`;

const kundenText = (kunden: number, vertraege: number) =>
  `${kunden} ${kunden === 1 ? "neuer Kunde" : "neue Kunden"} mit ${vertraege} ${vertraege === 1 ? "Vertrag" : "Verträgen"}`;

/** Antwortsatz (Titel) und Satz darunter. Keine Gedankenstriche (Texte an Kunden). */
export function antwort(
  r: Rechnung,
  ctx: { kunden: number; vertraege: number; chancen: number; mitBestand: boolean },
): { titel: string; betont: string | null; rest: string; text: string } {
  const chancenSatz =
    ctx.chancen > 0 ? ` Dazu ${ctx.chancen === 1 ? "wartet 1 offene Chance" : `warten ${ctx.chancen} offene Chancen`} auf Sie.` : "";
  if (r.status === "ohne_kosten") {
    return r.einnahmen > 0
      ? { titel: "Ja:", betont: `${euroMitVorzeichen(r.einnahmen)} Provision`, rest: "aus diesem Zeitraum.", text: "Für diesen Zeitraum sind noch keine Kosten erfasst." }
      : { titel: "Noch keine Zahlen für diesen Zeitraum.", betont: null, rest: "", text: `Sobald Kosten und Abschlüsse da sind, sehen Sie hier, ob es sich rechnet.${chancenSatz}` };
  }
  if (r.status === "lohnt") {
    const euroSatz =
      r.ausEinemEuro != null ? ` Jeder eingesetzte Euro hat Ihnen ${euroCent(r.ausEinemEuro)} gebracht${ctx.mitBestand ? ", inklusive Bestand" : ""}.` : "";
    return {
      titel: "Ja:",
      betont: `${euroMitVorzeichen(r.ergebnis)} Gewinn`,
      rest: "aus diesem Zeitraum.",
      text: `${ctx.kunden > 0 ? `${kundenText(ctx.kunden, ctx.vertraege)}.` : "Noch kein neuer Kunde in diesem Zeitraum."}${euroSatz}`,
    };
  }
  const titel = r.abschluesse
    ? `Noch nicht ganz: ${r.abschluesse.von} bis ${r.abschluesse.bis} Abschlüsse fehlen bis zum Break-even.`
    : `Noch nicht ganz: Es fehlen noch ${euro(r.fehlend)} bis zum Break-even.`;
  const eingespielt =
    ctx.kunden > 0
      ? `${kundenText(ctx.kunden, ctx.vertraege)} ${ctx.kunden === 1 ? "hat" : "haben"} ${prozent(r.gedeckt)} Ihrer Kosten schon eingespielt.`
      : ctx.vertraege > 0
        ? `${ctx.vertraege} ${ctx.vertraege === 1 ? "weiterer Vertrag hat" : "weitere Verträge haben"} ${prozent(r.gedeckt)} Ihrer Kosten schon eingespielt.`
        : "In diesem Zeitraum gibt es noch keinen Abschluss.";
  return { titel, betont: null, rest: "", text: `${eingespielt}${chancenSatz}` };
}
