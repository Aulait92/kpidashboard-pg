"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Tab-Navigation für den Buyer-Bereich. Übersicht (KPIs, Forecast,
// Leaderboard) und Leads (Tabelle + Storno + Detail) liegen seit dem
// Tab-Umbau auf eigenen Routen — die Tabs hier sind reine Links, kein
// clientseitiges Show/Hide. usePathname dient nur dem Active-State.
const TABS = [
  { href: "/buyer", label: "KPIs", match: (p: string) => p === "/buyer" },
  {
    href: "/buyer/leads",
    label: "Leads",
    match: (p: string) => p.startsWith("/buyer/leads"),
  },
  {
    href: "/buyer/kanban",
    label: "Pipeline",
    match: (p: string) => p.startsWith("/buyer/kanban"),
  },
];

const CHATS_TAB = {
  href: "/buyer/chats",
  label: "Chats",
  match: (p: string) => p.startsWith("/buyer/chats"),
};

/** showChats: nur für Kunden mit WhatsApp-Assistent (sonst unverändert). */
export function BuyerTabs({ showChats = false }: { showChats?: boolean } = {}) {
  const pathname = usePathname() ?? "/buyer";
  const tabs = showChats ? [...TABS, CHATS_TAB] : TABS;
  return (
    <nav className="mt-6 border-b border-[color:var(--border)]">
      <ul className="-mb-px flex gap-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "inline-flex items-center px-4 py-2.5 text-sm font-semibold transition",
                  active
                    ? "border-b-2 border-[color:var(--brand)] text-[color:var(--brand)]"
                    : "border-b-2 border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
