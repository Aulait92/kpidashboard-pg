import { SubTabs } from "@/components/admin/sub-tabs";

/**
 * Reiter unter Admin → Zahlen. Seit 16.11.2026 auch das Lead-Dashboard („/“, Leads & Werbung) und Nutzung,
 * vorher zwei eigene Reiterleisten mit anderen Einträgen.
 */
export function ZahlenTabs({ neueBuchungen = 0 }: { neueBuchungen?: number }) {
  return (
    <SubTabs
      tabs={[
        { href: "/admin/neu/zahlen", label: "Übersicht", exact: true },
        { href: "/admin/neu/zahlen/umsatz", label: "Buchungen", count: neueBuchungen },
        { href: "/admin/neu/zahlen/qualitaet", label: "Stornoquote" },
        { href: "/admin/neu/zahlen/kunden", label: "Kündigung & Rückkehr" },
        { href: "/admin/neu/zahlen/qualitaet", label: "WhatsApp-Zustellung" },
        { href: "/admin/neu/zahlen/leads", label: "Leads & Werbung", exact: true },
        { href: "/admin/neu/zahlen/qualitaet", label: "Nutzung" },
      ]}
    />
  );
}
