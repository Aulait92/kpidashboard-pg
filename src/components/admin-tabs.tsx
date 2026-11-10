"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

// Globale Admin-Navigation: fünf Arbeitsbereiche + Einstellungen (Zahnrad).
// Abgeschaltet (Code bleibt): Media Buyer unter /admin/media-buyer.
const SETTINGS = ["/admin/einstellungen", "/admin/lead-eingang", "/admin/whatsapp/settings", "/admin/vertrieb/import", "/admin/buyers", "/admin/media-buyer"];
const isSettings = (p: string) => SETTINGS.some((s) => p.startsWith(s));

const TABS = [
  { href: "/admin/vertrieb", label: "Heute", match: (p: string) => p === "/admin/vertrieb" },
  {
    href: "/admin/vertrieb/kontakte",
    label: "Vertrieb",
    match: (p: string) => p.startsWith("/admin/vertrieb/") && !isSettings(p),
  },
  { href: "/admin/kunden", label: "Kunden", match: (p: string) => p.startsWith("/admin/kunden") },
  {
    href: "/admin/leads",
    label: "Leads",
    match: (p: string) => p.startsWith("/admin/leads") || (p.startsWith("/admin/whatsapp") && !isSettings(p)),
  },
  { href: "/", label: "Zahlen", match: (p: string) => p === "/" || p.startsWith("/admin/nutzung") },
];

/** Admin-Navigation in der Kopfzeile (gleicher Stil wie der Kundenbereich). */
export function AdminNav() {
  const pathname = usePathname() ?? "/";
  const settingsActive = isSettings(pathname);
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
      <Link
        href="/admin/einstellungen"
        title="Einstellungen"
        aria-label="Einstellungen"
        className={cn(
          "relative ml-auto inline-flex shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition",
          settingsActive
            ? "text-[color:var(--foreground)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand)]"
            : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
        )}
      >
        <Settings className="h-4 w-4" />
        <span className="hidden lg:inline">Einstellungen</span>
      </Link>
    </nav>
  );
}

/** Reiter innerhalb einer Seite (statt weiterer Punkte im Hauptmenü). */
export function SubTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean; count?: number }[] }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[color:var(--border)]">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
              active
                ? "border-[color:var(--brand)] text-[color:var(--foreground)]"
                : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {t.label}
            {t.count ? <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">{t.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
