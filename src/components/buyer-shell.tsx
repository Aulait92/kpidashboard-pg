"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  Columns3,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Sun,
  TrendingUp,
  Users,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { ToastProvider } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// App-Shell des Kundenbereichs: eine Kopfzeile mit Navigation und Profil-
// menü (Desktop), unten eine Tab-Leiste (Handy). Alle Seiten teilen sich
// Breite und Abstände — die Seiten selbst liefern nur noch Inhalt.

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (p: string) => boolean;
  badge?: number;
};

export function BuyerShell({
  displayName,
  showChats,
  chatBadge,
  children,
}: {
  displayName: string;
  showChats: boolean;
  chatBadge: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/buyer";
  // WhatsApp-Kunden: „Heute" ist die Startseite (Aufgabenliste), die Zahlen
  // haben einen eigenen Reiter. Alle anderen: Übersicht = Zahlen.
  const items: NavItem[] = showChats
    ? [
        { href: "/buyer", label: "Heute", icon: Sun, match: (p) => p === "/buyer" },
        { href: "/buyer/leads", label: "Leads", icon: Users, match: (p) => p.startsWith("/buyer/leads") },
        { href: "/buyer/kanban", label: "Pipeline", icon: Columns3, match: (p) => p.startsWith("/buyer/kanban") },
        {
          href: "/buyer/chats",
          label: "Chats",
          icon: MessageCircle,
          match: (p) => p.startsWith("/buyer/chats"),
          badge: chatBadge,
        },
        { href: "/buyer/zahlen", label: "Zahlen", icon: BarChart3, match: (p) => p.startsWith("/buyer/zahlen") },
      ]
    : [
        { href: "/buyer", label: "Übersicht", icon: LayoutDashboard, match: (p) => p === "/buyer" },
        { href: "/buyer/leads", label: "Leads", icon: Users, match: (p) => p.startsWith("/buyer/leads") },
        { href: "/buyer/kanban", label: "Pipeline", icon: Columns3, match: (p) => p.startsWith("/buyer/kanban") },
      ];

  return (
    <ToastProvider>
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href="/buyer" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-white">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
              performance<span className="text-[color:var(--brand)]">growth</span>
            </span>
          </Link>

          <nav className="hidden h-full items-stretch gap-1 md:flex">
            {items.map((it) => {
              const active = it.match(pathname);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "relative inline-flex items-center gap-2 px-3 text-sm font-medium transition",
                    active
                      ? "text-[color:var(--foreground)] after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[color:var(--brand)]"
                      : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                  )}
                >
                  {it.label}
                  {it.badge ? <Badge n={it.badge} /> : null}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto">
            <ProfileMenu name={displayName} />
          </div>
        </div>
      </header>

      <div className="flex-1 pb-20 md:pb-0">{children}</div>

      {/* Handy: Tab-Leiste unten wie in einer nativen App */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-md">
          {items.map((it) => {
            const active = it.match(pathname);
            const Icon = it.icon;
            return (
              <li key={it.href} className="flex-1">
                <Link
                  href={it.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                    active ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]",
                  )}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
                    {it.badge ? (
                      <span className="absolute -right-2.5 -top-1.5">
                        <Badge n={it.badge} />
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
    </ToastProvider>
  );
}

function Badge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function ProfileMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm transition hover:bg-[color:var(--background)]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
          {initials}
        </span>
        <span className="hidden font-medium sm:inline">{name}</span>
        <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-xl border border-[color:var(--border)] bg-white py-1 text-sm shadow-lg">
          <div className="border-b border-[color:var(--border)] px-3 py-2">
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-[color:var(--muted)]">Dein CRM</div>
          </div>
          <a
            href="https://performancegrowth.de/impressum"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-[color:var(--muted)] hover:bg-[color:var(--background)]"
          >
            Impressum
          </a>
          <a
            href="https://performancegrowth.de/datenschutz"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 text-[color:var(--muted)] hover:bg-[color:var(--background)]"
          >
            Datenschutz
          </a>
          <form action={logoutAction} className="border-t border-[color:var(--border)]">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
            >
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Schlanker Seitenkopf: Titel, Untertitel, Aktionen rechts. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 sm:mb-6 sm:items-end">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 hidden text-sm text-[color:var(--muted)] sm:block">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
