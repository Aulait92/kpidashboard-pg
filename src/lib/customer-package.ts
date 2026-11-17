// Anzeige der Paketart eines Kunden. Customer.plan ist standardmäßig „software“
// (auch bei Pay-per-Lead-Kunden aus dem Airtable-Abgleich). Ohne Angebot/Onboarding
// und ohne Betreuungsgebühr ist ein Kunde ein reiner Pay-per-Lead-Käufer.

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
