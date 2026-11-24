// Kundenbereich „Nur Leads“ (Ole, 24.11.2026): Kunden mit Paket „Nur Leads“ (Customer.plan „ppl“) kaufen Leads per Stück
// ohne Software. Sie sehen nur Leads (Liste, Lead mit Reklamation), die einfache Pipeline, „Leads bestellen“ und Konto &
// Rechnungen, in einem schlichten Rahmen ohne CRM-Menü (app/buyer/layout.tsx). Alle anderen Seiten leiten auf die Leads.

import { prisma } from "@/lib/prisma";
import { PPL_NUR_LEADS } from "@/lib/offer-pricing";

export const NUR_LEADS_MENUE = [
  { href: "/buyer/leads", label: "Leads" },
  { href: "/buyer/kanban", label: "Pipeline" },
  { href: "/buyer/bestellen", label: "Leads bestellen" },
  { href: "/buyer/konto", label: "Konto" },
] as const;

/** Erlaubte Pfade (mit Unterseiten); alles andere unter /buyer geht auf die Leads. */
export function nurLeadsPfadErlaubt(pfad: string): boolean {
  return NUR_LEADS_MENUE.some((m) => pfad === m.href || pfad.startsWith(`${m.href}/`));
}

/** Aktiver Menüeintrag zum Pfad (für die Markierung), sonst null. */
export function nurLeadsAktiv(pfad: string | null): string | null {
  if (!pfad) return null;
  return NUR_LEADS_MENUE.find((m) => pfad === m.href || pfad.startsWith(`${m.href}/`))?.href ?? null;
}

export async function istNurLeadsKonto(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true } });
  return c?.plan === PPL_NUR_LEADS;
}
