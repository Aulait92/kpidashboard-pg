// Fachbegriffe in einem Satz (Usability-Check 18.11.2026), für das kleine „i“ (components/info-hinweis.tsx).
// Vermittler-Oberfläche in Sie-Form; keine Gedankenstriche, keine neuen Versprechen.

import { GARANTIE_FRISTEN, VERTRAGS_GARANTIE_MIN_VERTRAEGE } from "@/lib/rechner";

export const BETREUUNG_ERKLAERT =
  "Die Betreuungsstufe richtet sich nach Ihrem gesamten Werbebudget im Monat und bestimmt den Monatspreis für Betreuung und Software.";

export const PREISSTUFE_ERKLAERT =
  "Der Monatspreis für Betreuung und Software richtet sich nach Ihrem gesamten Werbebudget im Monat; die Stufen stehen in der Preisstaffel.";

export const BEDENKZEIT_ERKLAERT = "Bedenkzeit: Ihr Kunde überlegt nach dem Angebot noch, danach fasst die App automatisch nach.";

export const BREAKEVEN_ERKLAERT = `Für Vertreter: Liegt die Provision nach ${GARANTIE_FRISTEN.breakEvenTage} aktiven Tagen unter Werbebudget plus Betreuung, betreuen wir ohne Betreuungsgebühr weiter, bis es sich rechnet (längstens ${GARANTIE_FRISTEN.maxFreiMonate} Monate, Bedingungen laut AGB).`;

export const VERTRAGSGARANTIE_ERKLAERT = `Für Makler: Weniger als ${VERTRAGS_GARANTIE_MIN_VERTRAEGE} Verträge nach ${GARANTIE_FRISTEN.vertragTage} aktiven Tagen, dann betreuen wir ohne Gebühr weiter, bis sie erreicht sind (längstens ${GARANTIE_FRISTEN.maxFreiMonate} Monate, Bedingungen laut AGB).`;

export const SICHT_ERKLAERT = "Kerngeschäft: nur vertraglich wiederkehrender Umsatz aus Software und Betreuung; Gesamt: zusätzlich Pay-per-Lead.";

export const NRR_ERKLAERT = "NRR (Umsatzbindung): heutiger Umsatz der Kunden von damals geteilt durch ihren Umsatz damals, mit Ausbau und Kündigungen.";

export const CLV_ERKLAERT = "CLV (Kundenwert): Rohertrag je Kunde und Monat mal erwartete Laufzeit in Monaten.";

/** Wachstum: Bestandsprovision des ganzen Bestands pro Jahr gegenüber der künftigen Provision aus den neuen Verträgen. */
export const bestandErklaert = (wort: string) =>
  `${wort} pro Jahr zählt Ihren ganzen laufenden Bestand für ein Jahr, „${wort} (5 Jahre)“ nur die Verträge aus diesem Zeitraum über die nächsten 5 Jahre.`;
