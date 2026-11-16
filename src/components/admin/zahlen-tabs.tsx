import { SubTabs } from "@/components/admin/sub-tabs";

/**
 * Reiter unter Admin → Zahlen. Seit 16.11.2026 auch das Lead-Dashboard („/“, Leads & Werbung) und Nutzung,
 * vorher zwei eigene Reiterleisten mit anderen Einträgen.
 */
export function ZahlenTabs({ neueBuchungen = 0 }: { neueBuchungen?: number }) {
  return (
    <SubTabs
      tabs={[
        { href: "/admin/zahlen", label: "Übersicht", exact: true },
        { href: "/admin/zahlen/buchungen", label: "Buchungen", count: neueBuchungen },
        { href: "/admin/zahlen/stornoquote", label: "Stornoquote" },
        { href: "/admin/zahlen/lebenszyklus", label: "Kündigung & Rückkehr" },
        { href: "/admin/zahlen/whatsapp", label: "WhatsApp-Zustellung" },
        { href: "/", label: "Leads & Werbung", exact: true },
        { href: "/admin/nutzung", label: "Nutzung" },
      ]}
    />
  );
}
