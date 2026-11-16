import { SubTabs } from "@/components/admin/sub-tabs";

/**
 * Reiter im Bereich Kunden (Admin-Makeover Runde 2, Ole 16.11.2026): Kundenliste und -Pipeline, dazu Leads und
 * Pay-per-Lead (früher eigener Bereich „Leads“), Optimierung und Monatsberichte (früher unter Einstellungen),
 * Media Buyer unter Pay-per-Lead. Die Adressen sind gleich geblieben.
 */
export const KUNDEN_TABS = [
  { href: "/admin/kunden", label: "Übersicht", exact: true },
  { href: "/admin/kunden/pipeline", label: "Pipeline" },
  { href: "/admin/leads", label: "Leads" },
  { href: "/admin/ppl", label: "Pay-per-Lead", also: ["/admin/media-buyer"] },
  { href: "/admin/optimierung", label: "Optimierung" },
  { href: "/admin/monatsberichte", label: "Monatsberichte" },
];

export function KundenTabs() {
  return <SubTabs tabs={KUNDEN_TABS} />;
}
