// Preisgrenze je Lead und Monats-Gesamtgrenze für den Media Buyer (reine
// Logik, testbar). Vorläufig (Red Team, 20.11.2026), bis Ole eine Zielmarge
// festlegt.
//
// Höchstpreis je Pool (Vorrang von oben nach unten):
//   1. DeliveryPool.maxCpl (Feld je Pool, für Oles Zielmarge)
//   2. Env MEDIA_BUYER_MAX_CPL (gilt für alle Pools)
//   3. Break-even = Ø Lead-Preis der Bezüge des Pools × (1 − Stornoquote der
//      letzten 30 Tage; nicht ermittelbar → MEDIA_BUYER_DEFAULT_STORNO, Standard 0,1)
//      Steuerfreie Leads (§ 4 Nr. 11 UStG, CFO 20.11.2026): Für sie ist die
//      Vorsteuer aus der Meta-Werbung nicht abziehbar, die Reverse-Charge-USt wird
//      zu echten Kosten. Daher Break-even = P × (1 − s) / (1 + USt × q), q = Anteil
//      steuerfreier Leads im Pool (nach Menge gewichtet aus den Software-Bezügen),
//      USt = MEDIA_BUYER_RC_VAT (Standard 0,19). Der CPL bleibt netto wie von Meta.
//   Kein Lead-Preis ermittelbar → kein Höchstpreis: Pool wird nicht erhöht
//   (nur halten/senken), Admin zeigt „Höchstpreis fehlt".
//
// Regeln:
//   - Budget nur erhöhen, wenn der 7-Tage-CPL unter dem Höchstpreis liegt.
//   - Endspurt-Boost nie, wenn der CPL über dem Höchstpreis liegt.
//   - Liegt der CPL MEDIA_BUYER_CPL_ALERT_RUNS Läufe (Standard 3) in Folge
//     darüber, Push an Admins.
//   - Optionale Monats-Gesamtgrenze MEDIA_BUYER_MONTHLY_CAP (EUR, über alle
//     Pools und Kanäle; Standard aus): Erhöhungen nur, soweit Ausgaben bisher +
//     (aktuelle Tagesrate + Erhöhung) × Resttage die Grenze nicht übersteigen.
//     Ist die Grenze erreicht, wird pausiert.
//
// Env: MEDIA_BUYER_MAX_CPL, MEDIA_BUYER_DEFAULT_STORNO (0.1),
//      MEDIA_BUYER_STORNO_MIN_LEADS (20, darunter gilt die Quote als nicht
//      ermittelbar), MEDIA_BUYER_RC_VAT (0.19), MEDIA_BUYER_CPL_ALERT_RUNS (3), MEDIA_BUYER_MONTHLY_CAP (aus).

import type { GuardableDecision } from "@/lib/media-buyer-lernphase";

const eur2 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const eur0 = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export type MaxCpl = {
  value: number | null;
  source: "pool" | "env" | "break-even" | null;
  // Anteil steuerfreier Leads (q), der in den Break-even eingerechnet wurde (0 = keiner).
  taxFreeShare?: number;
};

export function computeMaxCpl(p: {
  poolOverride: number | null;
  envOverride: number | null;
  leadPrices: number[];
  stornoRate: number | null;
  defaultStorno: number;
  // Anteil steuerfreier Leads (0..1) und Reverse-Charge-Satz (Standard 0,19).
  taxFreeShare?: number | null;
  rcVat?: number;
}): MaxCpl {
  if (p.poolOverride != null && p.poolOverride > 0)
    return { value: p.poolOverride, source: "pool" };
  if (p.envOverride != null && p.envOverride > 0)
    return { value: p.envOverride, source: "env" };
  const prices = p.leadPrices.filter((x) => Number.isFinite(x) && x > 0);
  if (prices.length === 0) return { value: null, source: null };
  const avg = prices.reduce((s, x) => s + x, 0) / prices.length;
  const storno = Math.min(0.9, Math.max(0, p.stornoRate ?? p.defaultStorno));
  const q = Math.min(1, Math.max(0, p.taxFreeShare ?? 0));
  const vat = Math.max(0, p.rcVat ?? 0.19);
  return {
    value: Math.round(((avg * (1 - storno)) / (1 + vat * q)) * 100) / 100,
    source: "break-even",
    taxFreeShare: q,
  };
}

// Stornoquote aus (genehmigte Stornos / zugestellte Leads); unter minLeads
// zugestellten Leads nicht ermittelbar (null).
export function stornoRate(delivered: number, cancelled: number, minLeads: number): number | null {
  if (delivered < minLeads || delivered <= 0) return null;
  return cancelled / delivered;
}

function raises(decision: GuardableDecision, currentBudget: number): boolean {
  return decision.targetBudget != null && decision.targetBudget > currentBudget + 0.005;
}

// Preisgrenze anwenden: keine Erhöhung (inkl. Boost) ohne Höchstpreis oder
// bei CPL über dem Höchstpreis. Senken, Pausieren und Halten bleiben erlaubt.
export function applyPriceGuard(p: {
  decision: GuardableDecision;
  currentBudget: number;
  costPerLead: number | null;
  maxCpl: number | null;
}): { decision: GuardableDecision; blocked: boolean; overMax: boolean } {
  const overMax = p.costPerLead != null && p.maxCpl != null && p.costPerLead > p.maxCpl;
  if (!raises(p.decision, p.currentBudget)) {
    return { decision: p.decision, blocked: false, overMax };
  }
  let why: string | null = null;
  if (p.maxCpl == null) why = "Höchstpreis fehlt (kein Lead-Preis ermittelbar), Budget nicht erhöht.";
  else if (p.costPerLead == null) why = "CPL der letzten 7 Tage unbekannt, Budget nicht erhöht.";
  else if (overMax)
    why = `Preisgrenze: CPL ${eur2.format(p.costPerLead)} (7 Tage) über Höchstpreis ${eur2.format(p.maxCpl)}, ${p.decision.action === "boost" ? "kein Endspurt-Boost" : "Budget nicht erhöht"}.`;
  if (!why) return { decision: p.decision, blocked: false, overMax };
  const keepActive = p.decision.setStatus === "ACTIVE";
  return {
    decision: {
      // Reaktivieren (was der Buyer selbst pausiert hat) bleibt erlaubt, aber
      // nur mit dem bisherigen Budget.
      action: keepActive ? "activate" : "none",
      reason: `${why} Geplant war: ${p.decision.reason}`,
      targetBudget: null,
      setStatus: p.decision.setStatus,
    },
    blocked: true,
    overMax,
  };
}

// Push bei Läufen in Folge über dem Höchstpreis: beim Erreichen der Schwelle
// und danach alle 6 weiteren Läufe (nicht bei jedem Lauf).
export function shouldAlertCpl(streak: number, alertRuns: number): boolean {
  if (streak < alertRuns) return false;
  return (streak - alertRuns) % 6 === 0;
}

// Monats-Gesamtgrenze: Erhöhung nur, soweit sie in die Grenze passt.
export function applyMonthlyCap(p: {
  decision: GuardableDecision;
  currentBudget: number;
  cap: number;
  spentMtd: number;
  dailyRate: number; // aktuelle Tagesausgaben über alle Pools/Kanäle
  daysLeft: number; // inkl. heute
}): { decision: GuardableDecision; limited: boolean } {
  const { decision, cap, spentMtd } = p;
  if (spentMtd >= cap) {
    if (decision.setStatus === "PAUSED") return { decision, limited: false };
    return {
      decision: {
        action: "pause",
        reason: `Monatsgrenze ${eur0.format(cap)} erreicht (bisher ${eur0.format(spentMtd)}), Kampagnen pausieren.`,
        targetBudget: null,
        setStatus: "PAUSED",
      },
      limited: true,
    };
  }
  if (!raises(decision, p.currentBudget)) return { decision, limited: false };
  const headroomPerDay = (cap - spentMtd) / Math.max(1, p.daysLeft) - p.dailyRate;
  const delta = (decision.targetBudget as number) - p.currentBudget;
  if (delta <= headroomPerDay) return { decision, limited: false };
  const allowed = Math.max(0, headroomPerDay);
  const note = `Monatsgrenze ${eur0.format(cap)}: Erhöhung auf +${eur0.format(allowed)}/Tag begrenzt.`;
  if (allowed < 0.5) {
    return {
      decision: {
        action: decision.setStatus === "ACTIVE" ? "activate" : "none",
        reason: `${note} Geplant war: ${decision.reason}`,
        targetBudget: null,
        setStatus: decision.setStatus,
      },
      limited: true,
    };
  }
  return {
    decision: {
      ...decision,
      targetBudget: p.currentBudget + allowed,
      reason: `${note} ${decision.reason}`,
    },
    limited: true,
  };
}
