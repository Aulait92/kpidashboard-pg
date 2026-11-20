// Umsatzsteuer beim Leadverkauf (Ole, 20.11.2026; Rechtsprüfung docs/recht/ust-leadverkauf-2026-11-19.md).
//
// Regeln:
//   - Leads an geprüfte Versicherungsvertreter/-makler (Registereintrag nach § 34d GewO, im Admin geprüft) sind
//     steuerfrei nach § 4 Nr. 11 UStG, wenn das Produkt eine Versicherungssparte ist (Tier, PKV, Tarifoptimierung,
//     Privatschutz, Sterbegeld, Zahn-/Krankenhauszusatz).
//   - Kindersparplan ist immer steuerpflichtig (19 %), auch wenn am Bezug etwas anderes steht.
//   - Abnehmer ohne geprüften Vermittlerstatus (Händler, Plattformen, Berater, nicht geprüft): 19 %.
//   - Software, Betreuung usw. laufen nie hierüber (eigene Rechnungen in lib/billing.ts).
//
// Preise sind immer netto gespeichert. Die Anzeige im Kundenbereich und die Stripe-Rechnung rechnen beide über
// `bestellBetrag`, damit Summe, Knopf und Abbuchung auf den Cent gleich sind (Steuer je Rechnungsposition gerundet,
// wie Stripe). Rein, ohne Datenbank: nutzbar im Browser, auf dem Server und in Tests.

import { canonicalProductKey } from "@/lib/products";
import { normalizeRegisterNummer } from "@/lib/erstinformation-shared";

export type Steuer = "steuerfrei_4_11" | "steuerpflichtig";
export const STEUER_WERTE: readonly Steuer[] = ["steuerfrei_4_11", "steuerpflichtig"];
export const isSteuer = (v: unknown): v is Steuer => v === "steuerfrei_4_11" || v === "steuerpflichtig";

/** Pflichthinweis auf der Rechnung (§ 14 Abs. 4 Satz 1 Nr. 8 UStG). */
export const STEUERFREI_RECHNUNGSHINWEIS = "Steuerfreie Leistung nach § 4 Nr. 11 UStG";
/** Hinweis am Preis im Kundenbereich. */
export const STEUERFREI_PREISHINWEIS = "umsatzsteuerfrei nach § 4 Nr. 11 UStG";

export const UST_PROZENT = 19;

/** Status laut Vermittlerregister (Customer.vermittlerRegisterStatus). */
export type RegisterStatus = "vertreter" | "makler" | "keiner";
export const REGISTER_STATUS: { value: RegisterStatus; label: string }[] = [
  { value: "vertreter", label: "Versicherungsvertreter (§ 34d Abs. 1 oder gebunden Abs. 7)" },
  { value: "makler", label: "Versicherungsmakler (§ 34d Abs. 1)" },
  { value: "keiner", label: "Kein Vertreter/Makler (z. B. Berater, Händler, Plattform)" },
];
export const isRegisterStatus = (v: unknown): v is RegisterStatus => v === "vertreter" || v === "makler" || v === "keiner";

const KINDERSPARPLAN = /kinderspar|sparplan/i;
// Versicherungssparten der Kategorie A/B laut Rechtsprüfung. Unbekannte Produkte (z. B. Kinderwunsch-Kliniken) bleiben
// steuerpflichtig, bis Ole sie am Bezug ausdrücklich freigibt.
const VERSICHERUNG = /katze|hund|pferd|\btkv\b|\btier|privatschutz|haftpflicht|hausrat|unfall|rechtsschutz|\bpkv\b|tarif-?optim|sterbegeld|zahn|krankenhaus/i;

export const isKindersparplan = (productKey: string) => KINDERSPARPLAN.test(productKey);

/** Standard je Produkt: Versicherungssparte → steuerfrei_4_11 (sofern Käufer geprüft), sonst steuerpflichtig. */
export function standardSteuer(productKey: string): Steuer {
  if (isKindersparplan(productKey)) return "steuerpflichtig";
  const key = canonicalProductKey(productKey);
  if (key === "Wechsel" || key === "Neugeschäft") return "steuerfrei_4_11"; // PKV-Tarifoptimierung / PKV-Neugeschäft
  return VERSICHERUNG.test(productKey) ? "steuerfrei_4_11" : "steuerpflichtig";
}

/** Kennzeichen des Bezugs (eigene Einstellung oder Standard je Produkt), noch ohne Blick auf den Käufer. */
export function bezugSteuer(sub: { productKey: string; steuer?: string | null }): Steuer {
  if (isKindersparplan(sub.productKey)) return "steuerpflichtig";
  return isSteuer(sub.steuer) ? sub.steuer : standardSteuer(sub.productKey);
}

export type Registerpruefung = {
  vermittlerRegisterNr?: string | null;
  vermittlerRegisterStatus?: string | null;
  vermittlerGeprueftAt?: Date | string | null;
};

/** Käufer ist als Versicherungsvertreter oder -makler im Register geprüft (Nummer gültig, Prüfdatum gesetzt). */
export function vermittlerGeprueft(c: Registerpruefung | null | undefined): boolean {
  if (!c) return false;
  if (c.vermittlerRegisterStatus !== "vertreter" && c.vermittlerRegisterStatus !== "makler") return false;
  if (!normalizeRegisterNummer(c.vermittlerRegisterNr)) return false;
  return !!c.vermittlerGeprueftAt;
}

/** Steuer, mit der eine Bestellung dieses Bezugs abgerechnet wird, und der Grund (für den Admin). */
export function effektiveSteuer(
  sub: { productKey: string; steuer?: string | null },
  kunde: Registerpruefung | null | undefined,
): { steuer: Steuer; grund: string } {
  if (isKindersparplan(sub.productKey)) return { steuer: "steuerpflichtig", grund: "Kindersparplan ist immer steuerpflichtig" };
  if (bezugSteuer(sub) === "steuerpflichtig") return { steuer: "steuerpflichtig", grund: isSteuer(sub.steuer) ? "am Bezug als steuerpflichtig eingestellt" : "Produkt ist keine Versicherungssparte" };
  if (!vermittlerGeprueft(kunde)) {
    const grund =
      kunde?.vermittlerRegisterStatus === "keiner" ? "Käufer ist laut Register kein Vertreter/Makler" : "Vermittlerstatus des Käufers ist nicht geprüft";
    return { steuer: "steuerpflichtig", grund };
  }
  return { steuer: "steuerfrei_4_11", grund: "geprüfter Vermittler, Versicherungssparte" };
}

// ─── Beträge ────────────────────────────────────────────────────────────

const toCents = (eur: number) => Math.round(eur * 100);
/** Steuer einer Rechnungsposition in Cent, symmetrisch kaufmännisch gerundet (wie Stripe je Position). */
export function steuerCent(nettoCent: number, steuer: Steuer): number {
  if (steuer !== "steuerpflichtig") return 0;
  return Math.sign(nettoCent) * Math.round((Math.abs(nettoCent) * UST_PROZENT) / 100);
}

/** Bruttopreis je Lead (für die Anzeige „X € je Lead“). */
export function bruttoJeLead(nettoEur: number, steuer: Steuer): number {
  const c = toCents(nettoEur);
  return (c + steuerCent(c, steuer)) / 100;
}

/**
 * Netto aus einem kalkulierten Bruttopreis (steuerpflichtig, inkl. 19 %), auf Cent gerundet: 65 € → 54,62 €.
 * Hinweis: 54,62 € netto ergeben je Lead wieder 65,00 € brutto; bei größeren Mengen kann die Summe wegen der
 * Rundung um wenige Cent unter Menge × 65 € liegen (20 Leads: 1.299,96 €).
 */
export function nettoAusBrutto(bruttoEur: number): number {
  return Math.round((bruttoEur * 100 * 100) / (100 + UST_PROZENT)) / 100;
}

export type BestellPosition = { description: string; amountEur: number };
export type BestellBetrag = {
  /** Positionen netto, genau so an Stripe (chargeNow) */
  lines: BestellPosition[];
  /** Leads netto vor Gutschrift */
  leadsNetto: number;
  /** verrechnete Gutschrift netto */
  gutschrift: number;
  netto: number;
  steuerBetrag: number;
  /** Abbuchungsbetrag = Summe im Kundenbereich = Knopf */
  brutto: number;
  steuer: Steuer;
};

/**
 * Betrag einer Wochenbestellung: Menge × Preis, abzüglich offener Gutschrift (höchstens bis 0), Steuer je Position.
 * Einzige Rechenstelle für Anzeige (Bestellseite) und Abbuchung (placeOrder → chargeNow).
 */
export function bestellBetrag(opts: { price: number; quantity: number; credit: number; steuer: Steuer; label?: string; creditLabel?: string }): BestellBetrag {
  const leadsCent = toCents(opts.quantity * opts.price);
  const creditCent = Math.max(0, Math.min(toCents(opts.credit), leadsCent));
  const label = opts.label ?? `${opts.quantity} Leads`;
  const lines: BestellPosition[] = [{ description: label, amountEur: leadsCent / 100 }];
  if (creditCent > 0) lines.push({ description: opts.creditLabel ?? "Gutschrift aus Storno", amountEur: -creditCent / 100 });
  const nettoCent = leadsCent - creditCent;
  const steuerSumme = steuerCent(leadsCent, opts.steuer) + (creditCent > 0 ? steuerCent(-creditCent, opts.steuer) : 0);
  return {
    lines,
    leadsNetto: leadsCent / 100,
    gutschrift: creditCent / 100,
    netto: nettoCent / 100,
    steuerBetrag: steuerSumme / 100,
    brutto: (nettoCent + steuerSumme) / 100,
    steuer: opts.steuer,
  };
}
