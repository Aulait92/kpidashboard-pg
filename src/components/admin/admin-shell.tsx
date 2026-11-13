"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, Building2, Inbox, Settings, Sun, TrendingUp, type LucideIcon } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { AdminProfileMenu } from "@/components/admin/admin-profile-menu";
import { cn } from "@/lib/utils";
import { NotificationsButton } from "@/components/notifications-button";

// Neue Admin-Oberfläche (Admin-A): Seitenleiste am Rechner, unten fünf
// Bereiche am Handy. Die Seiten selbst bleiben dieselben wie bisher.
// Platz für Seitenleiste/Leiste unten schafft globals.css über [data-admin-shell].

const SETTINGS = ["/admin/einstellungen", "/admin/lead-eingang", "/admin/whatsapp/settings", "/admin/vertrieb/import", "/admin/buyers", "/admin/media-buyer"];
const isSettings = (p: string) => SETTINGS.some((s) => p.startsWith(s));

type Item = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean; badge?: number };

export function adminAreas(counts: { heute: number; vertrieb: number }): Item[] {
  return [
    { href: "/admin/heute", label: "Heute", icon: Sun, match: (p) => p === "/admin/heute", badge: counts.heute },
    {
      href: "/admin/vertrieb/kontakte",
      label: "Vertrieb",
      icon: Briefcase,
      match: (p) => p.startsWith("/admin/vertrieb") && !isSettings(p),
      badge: counts.vertrieb,
    },
    { href: "/admin/kunden", label: "Kunden", icon: Building2, match: (p) => p.startsWith("/admin/kunden") },
    {
      href: "/admin/leads",
      label: "Leads",
      icon: Inbox,
      match: (p) => p.startsWith("/admin/leads") || p.startsWith("/admin/ppl") || (p.startsWith("/admin/whatsapp") && !isSettings(p)),
    },
    {
      href: "/admin/zahlen",
      label: "Zahlen",
      icon: BarChart3,
      match: (p) => p === "/" || p.startsWith("/admin/zahlen") || p.startsWith("/admin/nutzung") || p.startsWith("/admin/einstellungen/kosten"),
    },
  ];
}

function Count({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Logo({ withName }: { withName?: boolean }) {
  return (
    <Link href="/admin/heute" className="flex items-center gap-2" aria-label="Zur Startseite">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-white">
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
      {withName ? (
        <span className="text-[15px] font-semibold tracking-tight">
          performance<span className="text-[color:var(--brand)]">growth</span>
        </span>
      ) : null}
    </Link>
  );
}

export function AdminShell({ email, counts }: { email: string; counts: { heute: number; vertrieb: number } }) {
  const pathname = usePathname() ?? "/";
  const items = adminAreas(counts);
  const settingsActive = isSettings(pathname);
  const current = items.find((it) => it.match(pathname))?.label ?? (settingsActive ? "Einstellungen" : "");

  return (
    <div data-admin-shell="">
      {/* Rechner: Seitenleiste */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[color:var(--border)] bg-white px-3 pb-3 pt-5 lg:flex">
        <div className="mb-5 px-2">
          <Logo withName />
        </div>
        <div className="mb-4 [&>button]:w-full">
          <CommandPalette />
        </div>
        <nav className="space-y-1" aria-label="Bereiche">
          {items.map((it) => {
            const active = it.match(pathname);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-[15px] font-medium transition",
                  active ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--foreground)] hover:bg-[color:var(--surface-sunken)]",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 1.9} />
                {it.label}
                {it.badge ? (
                  <span className="ml-auto">
                    <Count n={it.badge} />
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-1 border-t border-[color:var(--border)] pt-3">
          <Link
            href="/admin/einstellungen"
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm font-medium transition",
              settingsActive ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)]",
            )}
          >
            <Settings className="h-4 w-4" /> Einstellungen
          </Link>
          <div className="px-1 pb-1 [&>div>button]:w-full">
            <NotificationsButton />
          </div>
          <AdminProfileMenu email={email} newUi variant="sidebar" />
        </div>
      </aside>

      {/* Handy: schmale Kopfzeile */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-white/90 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Logo />
          <span className="min-w-0 truncate text-base font-semibold">{current}</span>
          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            <NotificationsButton />
            <AdminProfileMenu email={email} newUi />
          </div>
        </div>
      </header>

      {/* Handy: fünf Bereiche unten */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Bereiche"
      >
        <ul className="mx-auto flex max-w-lg">
          {items.map((it) => {
            const active = it.match(pathname);
            const Icon = it.icon;
            return (
              <li key={it.href} className="flex-1">
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-0.5 py-2 text-[12px] font-medium", active ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]")}
                >
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} />
                    {it.badge ? (
                      <span className="absolute -right-2.5 -top-1.5">
                        <Count n={it.badge} />
                      </span>
                    ) : null}
                  </span>
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
