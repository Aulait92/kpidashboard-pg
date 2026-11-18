// Anzeige der Paketart eines Kunden. Customer.plan ist standardmäßig „software“
// (auch bei Pay-per-Lead-Kunden aus dem Airtable-Abgleich). Ohne Angebot/Onboarding
// und ohne Betreuungsgebühr ist ein Kunde ein reiner Pay-per-Lead-Käufer.

import type { Prisma } from "@/generated/prisma/client";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";

export type PackageInput = { plan: string; retainerMonthly?: unknown; onboarding?: { id: string } | null };

export function packageLabel(c: PackageInput): string {
  if (c.plan === "internal") return "Intern";
  if (c.plan === "service") return "Nur Betreuung";
  const hasRetainer = c.retainerMonthly != null && Number(c.retainerMonthly) > 0;
  if (!hasRetainer && !c.onboarding) return "Pay-per-Lead";
  return "Betreuung + Software";
}

/** Kennzeichen interner Konten und Testkunden in Admin-Listen und Admin-Suche („Intern“ geht vor „Test“), sonst null. */
export function testKennung(c: { plan: string; isTest?: boolean | null }): "Intern" | "Test" | null {
  if (c.plan === "internal") return "Intern";
  return c.isTest ? "Test" : null;
}

/**
 * Prisma-Bedingung für reine Pay-per-Lead-Kunden (wie packageLabel „Pay-per-Lead“): kein „Nur Betreuung“, nicht intern,
 * ohne Betreuungsgebühr und ohne Onboarding. Ole, 18.11.2026: CRM-Erinnerungen gehen nicht an reine PPL-Kunden.
 */
export const NUR_PPL_WHERE: Prisma.CustomerWhereInput = {
  plan: { notIn: ["service", "internal"] },
  onboarding: { is: null },
  OR: [{ retainerMonthly: null }, { retainerMonthly: { lte: 0 } }],
};

export function istNurPayPerLead(c: PackageInput): boolean {
  return packageLabel(c) === "Pay-per-Lead";
}

/** Software-Paket mit CRM (Betreuung + Software): nur dann sagt die Quote „Nächster Schritt“ etwas aus. */
export const mitCrm = (c: PackageInput) => packageLabel(c) === "Betreuung + Software";

/**
 * Warnung „Nächster Schritt x %“ in der Kundenliste des Admins: ab 5 offenen Leads unter der Schwelle, nur für Kunden mit
 * Software (Ole, 18.11.2026: bei reinen Pay-per-Lead-Kunden ohne CRM irreführend; ebenso „Nur Betreuung“).
 */
export function naechsterSchrittWarnung(c: PackageInput, st: { rate: number | null; open: number } | null | undefined): string | null {
  if (!mitCrm(c) || !st || st.rate == null || st.open < 5 || st.rate >= NEXT_STEP_WARN_BELOW) return null;
  return `Nächster Schritt ${Math.round(st.rate * 100)} %`;
}
