// „Ihre erste Woche“ im Angebot Pay-per-Lead + Software (Ole, 20.11.2026): Anzeige- und Prüfregeln ohne Datenbank,
// gemeinsam für Admin-Formular, Angebotsseite, Annahme (lib/offers.ts) und Tests. Ablauf: lib/ppl/erste-woche.ts.

import { bestellBetrag, bezugSteuer, bruttoJeLead, type BestellBetrag, type Steuer } from "@/lib/ppl/steuer";

/** Mindestmenge wie bei Wochenbestellungen (lib/ppl/orders.ts MIN_ORDER; hier ohne Server-Import). */
export const ERSTE_WOCHE_MIN = 5;
export const ERSTE_WOCHE_MAX = 2000;
export const ERSTE_WOCHE_STANDARD = 20;

/** Lead-Produkte zur Auswahl im Angebot (wie Bezüge; freie Eingabe bleibt möglich). */
export const ERSTE_WOCHE_PRODUKTE = ["PKV-Tarifoptimierung", "TKV-Katze", "TKV-Hund", "TKV-Pferd", "Privatschutz", "Sterbegeld", "Kindersparplan"] as const;

export type ErsteWoche = { productKey: string; label: string | null; price: number; quantity: number };

/** Erste Woche aus einem Angebot (null = ohne). */
export function ersteWocheAus(o: { package?: string | null; pplProductKey?: string | null; pplLabel?: string | null; pplPrice?: unknown; pplQuantity?: number | null }): ErsteWoche | null {
  // Pay-per-Lead + Software und „Nur Leads“ (dort heißt sie „Erste Bestellung“)
  if ((o.package !== "ppl_software" && o.package !== "ppl") || !o.pplProductKey?.trim() || o.pplPrice == null) return null;
  const price = Number(o.pplPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { productKey: o.pplProductKey.trim(), label: o.pplLabel?.trim() || null, price, quantity: o.pplQuantity ?? ERSTE_WOCHE_STANDARD };
}

export const ersteWocheName = (w: Pick<ErsteWoche, "productKey" | "label">) => w.label || w.productKey;

/**
 * Betrag der ersten Woche für die Angebotsseite. Der Registerstatus ist vor der Annahme nicht geprüft: Angezeigt wird
 * nach dem Kennzeichen des Produkts (steuerfrei für geprüfte Vermittler), mit Hinweis.
 */
export function ersteWocheBetrag(w: Pick<ErsteWoche, "productKey" | "price">, quantity: number): BestellBetrag & { steuer: Steuer } {
  return bestellBetrag({ price: w.price, quantity, credit: 0, steuer: bezugSteuer({ productKey: w.productKey }) });
}

/** Menge der ersten Woche prüfen (ganze Zahl, 5 bis 2000). */
export function ersteWocheMenge(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= ERSTE_WOCHE_MIN && n <= ERSTE_WOCHE_MAX ? n : null;
}

// ─── Texte zur ersten Woche (Ole, 20.11.2026): Annahme, Angebot, Auftragsbestätigung, Angebotsmail ─────────────
// Steuer nach lib/ppl/steuer.ts: Versicherungssparten sind nur für geprüfte Vertreter/Makler steuerfrei, sonst 19 %
// (Kindersparplan und andere Nicht-Versicherungen immer 19 %). Abgebucht wird erst nach der Registerprüfung
// (lib/ppl/erste-woche.ts wartendeFreigeben). Keine Gedankenstriche.

/** Erste Woche mit der Wahl des Kunden (Anzahl, jede Woche wiederholen). */
export type ErsteWocheWahl = Pick<ErsteWoche, "productKey" | "price" | "quantity"> & { name: string; autoRenew: boolean };

/** „510,00 €“ (immer mit Cent, wie im Kundenbereich). */
export const eurCent = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Abbuchungszeitpunkt der ersten Woche. */
export const ERSTE_WOCHE_ABBUCHUNG = "Abbuchung zum Start, nach Prüfung Ihrer Registernummer";
/** „Nur Leads“: kein Start, abgebucht wird direkt nach der Prüfung. */
export const NUR_LEADS_ABBUCHUNG = "Abbuchung nach Prüfung Ihrer Registernummer";

/** Steuerhinweis zum Betrag der ersten Woche (ausführlich, mit Bedingung). */
export function ersteWocheSteuerText(steuer: Steuer): string {
  return steuer === "steuerfrei_4_11" ? "umsatzsteuerfrei nach § 4 Nr. 11 UStG für geprüfte Versicherungsvermittler (sonst zzgl. 19 % USt.)" : "inkl. 19 % USt.";
}

/** An die Summe angehängt: „, umsatzsteuerfrei nach …“ bzw. „ inkl. 19 % USt.“ */
const steuerAnhang = (steuer: Steuer) => `${steuer === "steuerfrei_4_11" ? ", " : " "}${ersteWocheSteuerText(steuer)}`;

/** Kurzer Steuerhinweis direkt am Betrag: „umsatzsteuerfrei“ bzw. „inkl. 19 % USt.“ */
export const ersteWocheSteuerKurz = (steuer: Steuer) => (steuer === "steuerfrei_4_11" ? "umsatzsteuerfrei" : "inkl. 19 % USt.");

/** Preis je Lead und Summe der ersten Woche, wie abgebucht (steuerfrei: netto = Betrag; steuerpflichtig: brutto). */
export function ersteWocheZahlen(w: Pick<ErsteWocheWahl, "productKey" | "price" | "quantity">) {
  const b = ersteWocheBetrag(w, w.quantity);
  return { steuer: b.steuer, jeLead: bruttoJeLead(w.price, b.steuer), summe: b.brutto };
}

/**
 * Punkt in „Das vereinbaren Sie mit dem Klick“ und in der Auftragsbestätigung:
 * „Erste Woche: 30 Leads TKV-Katze zu je 17,00 €, zusammen 510,00 €, umsatzsteuerfrei nach § 4 Nr. 11 UStG für geprüfte
 * Versicherungsvermittler (sonst zzgl. 19 % USt.), eigene Rechnung, Abbuchung zum Start, nach Prüfung Ihrer Registernummer.
 * Danach jede Woche dieselbe Menge, in der App jederzeit änderbar.“
 */
/** Überschrift der ersten Bestellung: „Erste Woche“ (Pay-per-Lead + Software) bzw. „Erste Bestellung“ („Nur Leads“). */
export const ersteBestellungTitel = (nurLeads: boolean) => (nurLeads ? "Erste Bestellung" : "Erste Woche");

export function ersteWocheVertragszeile(w: ErsteWocheWahl, nurLeads = false): string {
  const z = ersteWocheZahlen(w);
  const danach = w.autoRenew ? "Danach jede Woche dieselbe Menge, in der App jederzeit änderbar." : "Einmalig, ohne automatische Wiederholung. Weitere Leads bestellen Sie in der App.";
  return `${ersteBestellungTitel(nurLeads)}: ${w.quantity} Leads ${w.name} zu je ${eurCent(z.jeLead)}, zusammen ${eurCent(z.summe)}${steuerAnhang(z.steuer)}, eigene Rechnung, ${nurLeads ? NUR_LEADS_ABBUCHUNG : ERSTE_WOCHE_ABBUCHUNG}. ${danach}`;
}

/**
 * Zeile über dem Annahmeknopf statt „Jetzt fällig: 0 €“: Betrag fett, Rest als Zusatz.
 * „Erste Woche: 510,00 € (30 Leads, umsatzsteuerfrei), Abbuchung zum Start, nach Prüfung Ihrer Registernummer“
 */
export function ersteWocheFaellig(w: Pick<ErsteWocheWahl, "productKey" | "price" | "quantity">, nurLeads = false): { label: string; betrag: string; zusatz: string } {
  const z = ersteWocheZahlen(w);
  return { label: `${ersteBestellungTitel(nurLeads)}: `, betrag: eurCent(z.summe), zusatz: ` (${w.quantity} Leads, ${ersteWocheSteuerKurz(z.steuer)}), ${nurLeads ? NUR_LEADS_ABBUCHUNG : ERSTE_WOCHE_ABBUCHUNG}` };
}

/**
 * Zeile in der Angebotsmail (Sie oder Du, ohne Gedankenstriche): „Erste Woche: 20 Leads TKV-Katze zu je 17,00 €,
 * zusammen 340,00 €, umsatzsteuerfrei nach § 4 Nr. 11 UStG für geprüfte Versicherungsvermittler (sonst zzgl. 19 % USt.).
 * Die Anzahl wählen Sie bei der Annahme, abgebucht wird zum Start, nach Prüfung Ihrer Registernummer.“
 */
export function ersteWocheMailzeile(w: Omit<ErsteWocheWahl, "autoRenew">, du: boolean): string {
  const z = ersteWocheZahlen(w);
  const wahl = du
    ? "Die Anzahl wählst du bei der Annahme, abgebucht wird zum Start, nach Prüfung deiner Registernummer."
    : "Die Anzahl wählen Sie bei der Annahme, abgebucht wird zum Start, nach Prüfung Ihrer Registernummer.";
  return `Erste Woche: ${w.quantity} Leads ${w.name} zu je ${eurCent(z.jeLead)}, zusammen ${eurCent(z.summe)}${steuerAnhang(z.steuer)}. ${wahl}`;
}
