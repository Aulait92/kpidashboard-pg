import { SubTabs } from "@/components/admin/sub-tabs";

/** Reiter unter Admin → Zahlen: Übersicht | Buchungen | Stornoquote | Kündigung & Rückkehr. */
export function ZahlenTabs({ neueBuchungen = 0 }: { neueBuchungen?: number }) {
  return (
    <SubTabs
      tabs={[
        { href: "/admin/zahlen", label: "Übersicht", exact: true },
        { href: "/admin/zahlen/buchungen", label: "Buchungen", count: neueBuchungen },
        { href: "/admin/zahlen/stornoquote", label: "Stornoquote" },
        { href: "/admin/zahlen/lebenszyklus", label: "Kündigung & Rückkehr" },
      ]}
    />
  );
}
