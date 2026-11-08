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
    href: "/admin/activities",
    label: "Aktivitäten",
    match: (p: string) => p.startsWith("/admin/activities"),
  },
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
  {
    href: "/admin/whatsapp",
    label: "WhatsApp",
    match: (p: string) => p.startsWith("/admin/whatsapp"),
  },
];

/** Admin-Navigation in der Kopfzeile (gleicher Stil wie der Kundenbereich). */
export function AdminNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="-mb-px flex h-full min-w-0 items-stretch gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative inline-flex shrink-0 items-center px-3 text-sm font-medium transition",
              active
                ? "text-[color:var(--foreground)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand)]"
                : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
