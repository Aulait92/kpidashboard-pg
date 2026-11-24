// Anzeige der Paketart eines Kunden. Customer.plan ist standardmäßig „software“
// (auch bei Pay-per-Lead-Kunden aus dem Airtable-Abgleich). Ohne Angebot/Onboarding
// und ohne Betreuungsgebühr ist ein Kunde ein reiner Pay-per-Lead-Käufer.
// Paket „Pay-per-Lead + Software“ (Customer.plan „ppl_software“, Ole 19.11.2026): kauft Leads per Stück UND nutzt die
// Software. Gilt nie als reiner Pay-per-Lead-Kunde: alle Nachrichten (Assistent, Erstanschreiben, Erinnerungen,
// Nachfassen, Aufgaben-Mails, Mail-Strecke, Monatsbericht, Neuigkeiten) laufen wie bei Betreuung + Software.

import type { Prisma } from "@/generated/prisma/client";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";

export type PackageInput = { plan: string; retainerMonthly?: unknown; onboarding?: { id: string } | null };

export function packageLabel(c: PackageInput): string {
  if (c.plan === "internal") return "Intern";
  if (c.plan === "service") return "Nur Betreuung";
  if (c.plan === "ppl_software") return "Pay-per-Lead + Software";
  if (c.plan === "ppl") return "Nur Leads";
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
 * nicht „Pay-per-Lead + Software“,
 * ohne Betreuungsgebühr und ohne Onboarding. Ole, 18.11.2026: CRM-Erinnerungen gehen nicht an reine PPL-Kunden.
 */
export const NUR_PPL_WHERE: Prisma.CustomerWhereInput = {
  OR: [
    // „Nur Leads“ (24.11.2026): Paket mit Onboarding, aber ohne Software und CRM
    { plan: "ppl" },
    {
      plan: { notIn: ["service", "internal", "ppl_software", "ppl"] },
      onboarding: { is: null },
      OR: [{ retainerMonthly: null }, { retainerMonthly: { lte: 0 } }],
    },
  ],
};

export function istNurPayPerLead(c: PackageInput): boolean {
  const l = packageLabel(c);
  return l === "Pay-per-Lead" || l === "Nur Leads";
}

/** Paket mit CRM (Betreuung + Software bzw. Pay-per-Lead + Software): nur dann sagt die Quote „Nächster Schritt“ etwas aus. */
export const mitCrm = (c: PackageInput) => {
  const l = packageLabel(c);
  return l === "Betreuung + Software" || l === "Pay-per-Lead + Software";
};

/**
 * Warnung „Nächster Schritt x %“ in der Kundenliste des Admins: ab 5 offenen Leads unter der Schwelle, nur für Kunden mit
 * Software (Ole, 18.11.2026: bei reinen Pay-per-Lead-Kunden ohne CRM irreführend; ebenso „Nur Betreuung“).
 */
export function naechsterSchrittWarnung(c: PackageInput, st: { rate: number | null; open: number } | null | undefined): string | null {
  if (!mitCrm(c) || !st || st.rate == null || st.open < 5 || st.rate >= NEXT_STEP_WARN_BELOW) return null;
  return `Nächster Schritt ${Math.round(st.rate * 100)} %`;
}
