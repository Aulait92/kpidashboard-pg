"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, Building2, MessageCircle, Settings, Sun, TrendingUp, type LucideIcon } from "lucide-react";
import { CommandPalette } from "@/components/command-palette";
import { AdminProfileMenu } from "@/components/admin/admin-profile-menu";
import { adminBereich, type AdminBereich } from "@/lib/admin-bereiche";
import { cn } from "@/lib/utils";
import { NotificationsButton } from "@/components/notifications-button";
import { AdminNutzungMessung } from "@/components/admin/nutzung-messung";

// Admin-Oberfläche (Admin-Makeover Runde 2, Ole 16.11.2026): fünf Bereiche – Heute, Vertrieb, Kunden, Chats, Zahlen –
// in der Seitenleiste am Rechner und in der Leiste unten am Handy (ohne „Mehr“). Einstellungen unten in der
// Seitenleiste und im Profilmenü. Welche Adresse zu welchem Bereich gehört: src/lib/admin-bereiche.ts.
// Platz für Seitenleiste/Leiste unten schafft globals.css über [data-admin-shell].

type Counts = { heute: number; chats: number };
type Item = { href: string; label: AdminBereich; icon: LucideIcon; badge?: number };

export function adminAreas(counts: Counts): Item[] {
  return [
    { href: "/admin/heute", label: "Heute", icon: Sun, badge: counts.heute },
    { href: "/admin/vertrieb/kontakte", label: "Vertrieb", icon: Briefcase },
    { href: "/admin/kunden", label: "Kunden", icon: Building2 },
    { href: "/admin/whatsapp", label: "Chats", icon: MessageCircle, badge: counts.chats },
    { href: "/admin/zahlen", label: "Zahlen", icon: BarChart3 },
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
    <Link href="/admin/heute" className="-m-1.5 flex min-h-10 min-w-10 items-center gap-2 p-1.5" aria-label="Zur Startseite">
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

export function AdminShell({ email, counts }: { email: string; counts: Counts }) {
  const pathname = usePathname() ?? "/";
  const items = adminAreas(counts);
  const current = adminBereich(pathname) ?? "";
  const settingsActive = current === "Einstellungen";

  return (
    <div data-admin-shell="">
      <AdminNutzungMessung />
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
            const active = it.label === current;
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
          <AdminProfileMenu email={email} variant="sidebar" />
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
            <AdminProfileMenu email={email} />
          </div>
        </div>
      </header>

      {/* Handy: fünf Bereiche unten */}
      <MobileNav items={items} current={current} />
    </div>
  );
}

/** Leiste unten am Handy: alle fünf Bereiche direkt (Einstellungen über das Profil oben rechts). */
function MobileNav({ items, current }: { items: Item[]; current: string }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Bereiche"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((it) => {
          const active = it.label === current;
          const Icon = it.icon;
          return (
            <li key={it.href} className="flex-1">
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex w-full flex-col items-center gap-0.5 py-2 text-[12px] font-medium", active ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]")}
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
  );
}
