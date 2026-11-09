"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Globale Admin-Navigation; usePathname dient nur dem Active-State.
// Abgeschaltet (Code bleibt): Media Buyer unter /admin/media-buyer.
const TABS = [
  { href: "/", label: "Dashboard", match: (p: string) => p === "/" },
  { href: "/admin/vertrieb", label: "Vertrieb", match: (p: string) => p.startsWith("/admin/vertrieb") },
  { href: "/admin/leads", label: "Leads", match: (p: string) => p.startsWith("/admin/leads") },
  { href: "/admin/lead-eingang", label: "Lead-Eingang", match: (p: string) => p.startsWith("/admin/lead-eingang") },
  { href: "/admin/buyers", label: "Kunden-Logins", match: (p: string) => p.startsWith("/admin/buyers") },
  { href: "/admin/whatsapp", label: "WhatsApp", match: (p: string) => p.startsWith("/admin/whatsapp") },
  { href: "/admin/nutzung", label: "Nutzung", match: (p: string) => p.startsWith("/admin/nutzung") },
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
