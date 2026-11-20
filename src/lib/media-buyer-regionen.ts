// Regionen-Rechnung des Media Buyers (Ole, 20.11.2026). Reine Logik, ohne
// Datenbank, daher testbar.
//
// Fall: In einem bundesweiten Produkt-Pool sind alle Bezüge ohne PLZ-Grenze
// schon voll, offen sind nur noch Bezüge mit Regionen (z. B. Heinrich von
// Kleist mit seinen PLZ-Gebieten). Die bundesweiten Anzeigen bringen dann
// viele Leads, die keiner mehr abnimmt: Sie werden geparkt und nach 48 h
// verworfen (nie wieder verkauft), sind also Kosten ohne Erlös.
//
// Kennzahl:
//   Anteil verwertbar  = eingegangene Leads (Pool-Eingang, ohne Dubletten und
//                        Ungültige) mit PLZ in den offenen Regionen / alle
//                        eingegangenen Leads, aus den letzten 30 Tagen
//                        (MEDIA_BUYER_REGION_DAYS, mindestens 14).
//   Kosten je verwertbarem Lead = CPL (7 Tage, je eingegangenem Lead) / Anteil.
//   Break-even         = Lead-Preis der offenen Bezüge (gewichtet mit ihrer
//                        offenen Menge) × (1 − Storno) / (1 + USt × q)
//                        (wie der Höchstpreis, media-buyer-preisgrenze.ts).
//
// Regel:
//   Kosten ≤ Break-even          → weiterlaufen (keine Änderung).
//   Kosten > Break-even          → Budget nicht erhöhen.
//   Kosten > Break-even × 1,2    → Budget um einen Schritt (20 %) senken.
//   Pausieren oder eine regionale Kampagne anlegen entscheidet Ole; der Buyer
//   empfiehlt es im Admin und per Push.

import type { GuardableDecision } from "@/lib/media-buyer-lernphase";
import { plzMatches } from "@/lib/ppl/rules";

export type OpenSubscription = {
  customerId: string;
  name: string;
  /** Noch offene Menge bis Monatsende (fest + erwartet). */
  open: number;
  /** Wirksamer PLZ-Filter (eigener Filter, sonst Gebiete); null = bundesweit. */
  plzRanges: string | null;
  price: number;
  taxFree: boolean;
};

/**
 * Nur noch regionale Bezüge offen? Liefert die offenen Bezüge (alle mit
 * PLZ-Grenze), sonst null (nichts offen oder ein bundesweiter Bezug offen).
 */
export function regionOnlyOpen(subs: OpenSubscription[], minOpen = 0.5): OpenSubscription[] | null {
  const open = subs.filter((s) => s.open >= minOpen);
  if (open.length === 0) return null;
  if (open.some((s) => !(s.plzRanges ?? "").trim())) return null;
  return open;
}

/** Anteil der Leads, deren PLZ in eine der Regionen fällt (ohne PLZ = nicht verwertbar). */
export function usableShare(plzs: (string | null)[], ranges: string[]): number | null {
  if (plzs.length === 0) return null;
  const hits = plzs.filter((plz) => ranges.some((r) => plzMatches(r, plz))).length;
  return hits / plzs.length;
}

/** Lead-Preis und Steueranteil der offenen Bezüge, gewichtet mit der offenen Menge. */
export function openPriceAndTax(open: OpenSubscription[]): { price: number | null; taxFreeShare: number } {
  const weight = open.reduce((s, o) => s + o.open, 0);
  const priced = open.filter((o) => o.price > 0);
  const pricedWeight = priced.reduce((s, o) => s + o.open, 0);
  const price = pricedWeight > 0 ? priced.reduce((s, o) => s + o.price * o.open, 0) / pricedWeight : null;
  const taxFreeShare = weight > 0 ? open.filter((o) => o.taxFree).reduce((s, o) => s + o.open, 0) / weight : 0;
  return { price, taxFreeShare };
}

export type RegionCheck = {
  names: string[];
  share: number;
  sample: number;
  costPerUsable: number;
  breakEven: number;
  verdict: "weiter" | "halten" | "senken";
  message: string;
};

export const REGION_LOWER_FACTOR = 1.2;

const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Bewertet den Fall „nur Regionen offen“. null = nicht bewertbar (kein CPL,
 * kein Break-even, zu wenig Leads für einen Anteil).
 */
export function evaluateRegionCase(p: {
  open: OpenSubscription[];
  cpl: number | null;
  share: number | null;
  sample: number;
  breakEven: number | null;
  minSample?: number;
}): RegionCheck | null {
  if (p.cpl == null || p.cpl <= 0 || p.breakEven == null || p.breakEven <= 0) return null;
  if (p.share == null || p.sample < (p.minSample ?? 30)) return null;
  const names = [...new Set(p.open.map((o) => o.name))];
  const who = names.join(", ");
  const costPerUsable = p.share > 0 ? p.cpl / p.share : Number.POSITIVE_INFINITY;
  const verdict: RegionCheck["verdict"] =
    costPerUsable <= p.breakEven ? "weiter" : costPerUsable > p.breakEven * REGION_LOWER_FACTOR ? "senken" : "halten";
  const kosten = Number.isFinite(costPerUsable) ? eur2.format(costPerUsable) : "unbegrenzt (kein Lead in den Regionen)";
  const anteil = `${Math.round(p.share * 100)} % der Leads in den offenen Regionen`;
  const message =
    verdict === "weiter"
      ? `Nur ${who} offen: bundesweit kostet ein verwertbarer Lead ${kosten} (${anteil}), Break-even ${eur2.format(p.breakEven)}. Lohnt sich, läuft weiter.`
      : `Nur ${who} offen: bundesweit kostet ein verwertbarer Lead ${kosten}, Break-even ${eur2.format(p.breakEven)} (${anteil}). Empfehlung: regionale Kampagne für die Regionen von ${who} anlegen oder pausieren.`;
  return { names, share: p.share, sample: p.sample, costPerUsable, breakEven: p.breakEven, verdict, message };
}

/**
 * Wendet das Ergebnis auf die Budget-Entscheidung an: über Break-even keine
 * Erhöhung, deutlich darüber ein Schritt nach unten. Pausieren und
 * Reaktivieren bleiben unberührt (Reaktivieren nur ohne Erhöhung).
 */
export function applyRegionGuard(p: {
  decision: GuardableDecision;
  currentBudget: number;
  minBudget: number;
  check: RegionCheck | null;
  step?: number;
}): { decision: GuardableDecision; changed: boolean } {
  const { decision, check } = p;
  if (!check || check.verdict === "weiter") return { decision, changed: false };
  if (decision.setStatus === "PAUSED") return { decision, changed: false };
  const step = p.step ?? 0.2;
  const raises = decision.targetBudget != null && decision.targetBudget > p.currentBudget + 0.005;
  if (check.verdict === "senken" && p.currentBudget > p.minBudget + 0.005) {
    const lowered = Math.max(p.minBudget, p.currentBudget * (1 - step));
    if (decision.targetBudget != null && decision.targetBudget <= lowered) return { decision, changed: false };
    return {
      decision: {
        action: "decrease",
        reason: `${check.message} Budget einen Schritt gesenkt. Geplant war: ${decision.reason}`,
        targetBudget: lowered,
        setStatus: decision.setStatus,
      },
      changed: true,
    };
  }
  if (!raises) return { decision, changed: false };
  return {
    decision: {
      action: decision.setStatus === "ACTIVE" ? "activate" : "none",
      reason: `${check.message} Budget nicht erhöht. Geplant war: ${decision.reason}`,
      targetBudget: null,
      setStatus: decision.setStatus,
    },
    changed: true,
  };
}
