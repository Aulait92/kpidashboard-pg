// Darstellung der Investoren-Kennzahlen (ohne Datenbank): Kacheln, Tabellen und Definitionen in einer Quelle für die
// Seite (Geld › Auswertung), den CSV- und den PDF-Export, damit überall dieselben Zahlen und Worte stehen.

import { monthLabel } from "@/lib/revenue-ledger";
import { MIN_KOHORTE, MAX_LAUFZEIT, CAC_FENSTER, type InvestorKennzahlen } from "@/lib/investoren/kennzahlen";
import type { InvestorenDaten } from "@/lib/investoren/server";
import { SICHT_LABEL } from "@/lib/zahlen-sicht";

export const eur = (v: number) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const pct = (x: number | null | undefined, d = 0) => (x == null ? "–" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d })} %`);
export const monate = (v: number | null | undefined) => (v == null ? "–" : `${v.toLocaleString("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 })} Mon.`);
export const faktor = (v: number | null | undefined) => (v == null ? "–" : `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })}×`);
export const signed = (n: number) => (Math.abs(n) < 0.5 ? "0 €" : `${n > 0 ? "+" : "−"}${eur(Math.abs(n))}`);
export const monat = (k: string) => monthLabel(k, true);

/** Definitionen „So rechnen wir“: ein Satz je Kennzahl. */
export const DEFINITIONEN: { name: string; satz: string }[] = [
  { name: "MRR", satz: "Wiederkehrender Monatsumsatz im laufenden Monat: Verträge mit ihrem vereinbarten Betrag, Pay-per-Lead hochgerechnet, Einrichtung nie; ARR = MRR × 12." },
  { name: "Kunden-Bindung", satz: "Anteil der Kunden mit Umsatz vor 3, 6 bzw. 12 Monaten, die im letzten abgeschlossenen Monat noch Umsatz haben." },
  { name: "Umsatzbindung (NRR)", satz: "Heutiger Umsatz der Kunden von vor 3, 6 bzw. 12 Monaten geteilt durch ihren Umsatz damals, mit Ausbau; brutto (GRR) ohne Ausbau." },
  { name: "Bruttomarge", satz: "Wiederkehrender Umsatz minus direkte Kosten (Werbung für Kunden-Leads, Software, KI-Dienste, WhatsApp) geteilt durch den Umsatz, ohne Personal." },
  { name: "KI-Kosten", satz: "Ausgaben auf Konto und Karte mit Zweck „Direkt: KI-Dienste“ oder von bekannten KI-Anbietern, netto, als Teil der Software-Kosten." },
  { name: "CAC", satz: `Kosten der Kundengewinnung (eigene Werbung, Tools) der letzten ${CAC_FENSTER} abgeschlossenen Monate geteilt durch die neuen Kunden darin, wahlweise mit Gründerzeit.` },
  { name: "Amortisation", satz: "CAC geteilt durch den Rohertrag je Kunde und Monat: so viele Monate dauert es, bis ein Neukunde seine Gewinnung bezahlt hat." },
  { name: "Kundenwert (CLV)", satz: `Rohertrag je Kunde und Monat mal erwartete Laufzeit (1 geteilt durch die monatliche Kündigungsquote, höchstens ${MAX_LAUFZEIT} Monate).` },
  { name: "Kohorten", satz: `Umsatz der Kunden eines Startmonats in den Folgemonaten in Prozent des ersten Monats, erst ab ${MIN_KOHORTE} Kunden je Startmonat.` },
  { name: "Abo und Pay-per-Lead", satz: "Abo = Betreuung und Software zum vertraglichen Monatsbetrag, Pay-per-Lead = verkaufte, nicht stornierte Leads im Monat." },
];

export type Kachel = { label: string; wert: string; hinweis: string; zeilen: { label: string; wert: string }[]; text: string };

const def = (name: string) => DEFINITIONEN.find((d) => d.name === name)?.satz ?? "";

/** Die 5 Kacheln oben (Seite, CSV, PDF). */
export function kacheln(d: InvestorenDaten): Kachel[] {
  const k = d.k;
  const b = k.nrrKachel;
  const erste = k.bindung.find((x) => x.ab);
  const amort = k.cac.amortisation;
  return [
    {
      label: "MRR",
      wert: eur(k.mrr),
      hinweis: `ARR ${eur(k.arr)}${k.wachstum != null ? ` · ${k.wachstum >= 0 ? "+" : "−"}${pct(Math.abs(k.wachstum))}` : ""}`,
      zeilen: [
        { label: `MRR ${monat(k.lastComplete)}`, wert: eur(k.mrrVormonat) },
        { label: "Wachstum zum Vormonat", wert: k.wachstum == null ? "–" : pct(k.wachstum, 1) },
        { label: `Aktive Kunden ${monat(k.lastComplete)}`, wert: String(k.aktiveKunden) },
      ],
      text: def("MRR"),
    },
    {
      label: "Umsatzbindung",
      wert: b?.nrr != null ? pct(b.nrr) : "–",
      hinweis: b ? `nach ${b.monate} Monaten` : erste?.ab ? `ab ${monat(erste.ab)}` : "noch keine Kunden",
      zeilen: k.bindung.map((x) => ({ label: `Nach ${x.monate} Monaten`, wert: x.nrr != null ? `${pct(x.nrr)} (Kunden ${pct(x.kundenBindung)})` : x.ab ? `ab ${monat(x.ab)}` : "–" })),
      text: def("Umsatzbindung (NRR)"),
    },
    {
      label: "Bruttomarge",
      wert: pct(k.marge.letzter),
      hinweis: k.marge.letzter == null ? "noch kein abgeschlossener Monat" : `${monat(k.lastComplete)} · KI ${pct(k.marge.kiAnteil, 1)}`,
      zeilen: k.marge.monate.slice(-3).map((m) => ({ label: monat(m.month), wert: pct(m.marge) })),
      text: def("Bruttomarge"),
    },
    {
      label: "Amortisation",
      wert: monate(amort),
      hinweis: k.cac.cac != null ? `CAC ${eur(k.cac.cac)}` : "noch keine Neukunden",
      zeilen: [
        { label: "CAC", wert: k.cac.cac != null ? eur(k.cac.cac) : "–" },
        { label: "CAC mit Gründerzeit", wert: k.cac.cacMitGruender != null ? eur(k.cac.cacMitGruender) : "–" },
        { label: "Amortisation mit Gründerzeit", wert: monate(k.cac.amortisationMitGruender) },
        { label: `Neue Kunden (${k.cac.fenster.map((m) => monthLabel(m)).join(", ") || "–"})`, wert: String(k.cac.neukunden) },
        { label: "Rohertrag je Kunde und Monat", wert: k.cac.rohertragJeKunde != null ? eur(k.cac.rohertragJeKunde) : "–" },
      ],
      text: `${def("CAC")} ${def("Amortisation")}`,
    },
    {
      label: "Kundenwert : CAC",
      wert: faktor(k.clv.zuCac),
      hinweis: k.clv.wert != null ? `CLV ${eur(k.clv.wert)}` : "ab 2 Monaten Umsatz",
      zeilen: [
        { label: "Kundenwert (CLV)", wert: k.clv.wert != null ? eur(k.clv.wert) : "–" },
        { label: "Erwartete Laufzeit", wert: k.kuendigung ? `${monate(k.clv.laufzeit)}${k.clv.laufzeitGedeckelt ? " (gedeckelt)" : ""}` : "–" },
        { label: "Kündigungsquote je Monat", wert: k.kuendigung ? pct(k.kuendigung.quote, 1) : "–" },
      ],
      text: `${def("Kundenwert (CLV)")} Geteilt durch den CAC ohne Gründerzeit, wie die Amortisation.`,
    },
  ];
}

/** Tabellenzeilen „Bindung“: je Zeitraum Kunden, netto, brutto oder „ab Monat“. */
export function bindungZeilen(k: InvestorKennzahlen) {
  return k.bindung.map((b) => ({
    zeitraum: `${b.monate} Monate`,
    basis: monat(b.basis),
    kunden: b.kundenBindung != null ? `${b.gehalten} von ${b.kunden} (${pct(b.kundenBindung)})` : b.ab ? `ab ${monat(b.ab)}` : "–",
    nrr: pct(b.nrr),
    grr: pct(b.grr),
  }));
}

export function sichtText(d: InvestorenDaten) {
  return SICHT_LABEL[d.sicht];
}

/** „Stand 18.11.2026 · Nov 2026 hochgerechnet“, mit Sicht für die Exporte („… · Kerngeschäft (Software + Betreuung)“) */
export function standText(d: InvestorenDaten, mitSicht = true) {
  return `Stand ${new Date(d.generatedAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} · ${monat(d.k.current)} hochgerechnet${mitSicht ? ` · ${sichtText(d)}` : ""}`;
}
