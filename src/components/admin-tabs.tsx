"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Globale Admin-Navigation. Wird in /admin/crm und /admin/kpis genutzt
// (und perspektivisch auch in /admin/buyers, /admin/media-buyer, /).
// usePathname dient nur dem Active-State.
const TABS = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/admin/crm", label: "CRM", match: (p: string) => p.startsWith("/admin/crm") },
  {
    href: "/admin/kpis",
    label: "KPIs",
    match: (p: string) => p.startsWith("/admin/kpis"),
  },
  {
    href: "/admin/media-buyer",
    label: "Media Buyer",
    match: (p: string) => p.startsWith("/admin/media-buyer"),
  },
  {
    href: "/admin/buyers",
    label: "Buyer-Accounts",
    match: (p: string) => p.startsWith("/admin/buyers"),
  },
];

export function AdminTabs() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="mt-6 border-b border-[color:var(--border)]">
      <ul className="-mb-px flex flex-wrap gap-1">
        {TABS.map((tab) => {
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
