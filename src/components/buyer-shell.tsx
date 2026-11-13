"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  Contact,
  Columns3,
  CreditCard,
  Gift,
  Percent,
  ListChecks,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Plane,
  Search,
  ShoppingCart,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { PushHint, PushMenuItem } from "@/components/push-prompt";
import { HilfeChat } from "@/components/hilfe-chat";
import { AbsenceControl, dayShort, type ShellAbsence } from "@/components/absence-sheet";
import { normalizePath, sendUsage } from "@/lib/usage-client";
import { cn } from "@/lib/utils";
import { showNewBadge } from "@/lib/empfehlung/shared";

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
  setupOpen = 0,
  teamRole = "owner",
  hasTeam = false,
  showOrders = false,
  showBestand = false,
  newUi = false,
  absence = null,
  updatesUnread = 0,
  children,
}: {
  /** Ungelesene Neuigkeiten des Logins (Profilmenü). */
  updatesUnread?: number;
  /** Neue Oberfläche (Vertreter-A), pro Kunde im Admin einschaltbar. */
  newUi?: boolean;
  /** „Ich bin abwesend“ (null in der Admin-Vorschau). */
  absence?: ShellAbsence | null;
  /** Modul Bestandskunden-Kampagnen freigeschaltet. */
  showBestand?: boolean;
  /** Pay-per-Lead-Käufer: Reiter „Bestellen“. */
  showOrders?: boolean;
  /** Mehrere Logins → „Mein Kalender" im Profilmenü. */
  hasTeam?: boolean;
  displayName: string;
  /** owner = Inhaber (Konto, Team), advisor = Berater (nur eigene Leads). */
  teamRole?: "owner" | "advisor";
  showChats: boolean;
  chatBadge: number;
  /** Offene Einrichtungsschritte (Onboarding) – 0 = Reiter ausblenden. */
  setupOpen?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/buyer";
  // Seitenaufrufe zählen (Nutzungsmessung, pseudonym).
  useEffect(() => {
    void sendUsage({ type: "page", name: normalizePath(pathname) });
  }, [pathname]);
  if (newUi) {
    return (
      <BuyerShellA
        pathname={pathname}
        displayName={displayName}
        showChats={showChats}
        chatBadge={chatBadge}
        setupOpen={setupOpen}
        teamRole={teamRole}
        hasTeam={hasTeam}
        absence={absence}
        updatesUnread={updatesUnread}
      >
        {children}
      </BuyerShellA>
    );
  }
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
        ...(teamRole === "advisor"
          ? []
          : [{ href: "/buyer/zahlen", label: "Zahlen", icon: BarChart3, match: (p: string) => p.startsWith("/buyer/zahlen") }]),
      ]
    : [
        ...(teamRole === "advisor"
          ? []
          : [{ href: "/buyer", label: "Übersicht", icon: LayoutDashboard, match: (p: string) => p === "/buyer" }]),
        { href: "/buyer/leads", label: "Leads", icon: Users, match: (p) => p.startsWith("/buyer/leads") },
        { href: "/buyer/kanban", label: "Pipeline", icon: Columns3, match: (p) => p.startsWith("/buyer/kanban") },
      ];
  if (showBestand) {
    items.push({ href: "/buyer/bestand", label: "Bestand", icon: Contact, match: (p) => p.startsWith("/buyer/bestand") });
  }
  if (showOrders) {
    items.push({ href: "/buyer/bestellen", label: "Bestellen", icon: ShoppingCart, match: (p) => p.startsWith("/buyer/bestellen") });
  }
  if (setupOpen > 0) {
    items.unshift({
      href: "/buyer/einrichtung",
      label: "Einrichtung",
      icon: ListChecks,
      match: (p) => p.startsWith("/buyer/einrichtung"),
      badge: setupOpen,
    });
  }

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

          <div className="ml-auto flex items-center gap-2">
            <HilfeChat firstName={displayName.replace(/^Allianz\s+/i, "").split(/\s+/)[0] ?? ""} owner={teamRole === "owner"} />
            <ProfileMenu name={displayName} owner={teamRole === "owner"} hasTeam={hasTeam} absence={absence} updatesUnread={updatesUnread} />
          </div>
        </div>
      </header>

      <div className="flex-1 pb-20 md:pb-0">
        {absence ? <AbsenceControl data={absence} /> : null}
        <PushHint />
        {children}
      </div>

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
                  data-haptic="selection"
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

function ProfileMenu({
  name,
  owner,
  hasTeam,
  newUi = false,
  setupOpen = 0,
  variant = "header",
  absence = null,
  updatesUnread = 0,
}: {
  absence?: ShellAbsence | null;
  updatesUnread?: number;
  name: string;
  owner: boolean;
  hasTeam: boolean;
  /** Neue Oberfläche: Einrichtung, Hilfe und Kalender im Menü. */
  newUi?: boolean;
  setupOpen?: number;
  /** sidebar = unten in der Seitenleiste (Menü öffnet nach oben). */
  variant?: "header" | "sidebar";
}) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
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
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition hover:bg-[color:var(--surface-sunken)]"
        >
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
            {initials}
            {updatesUnread > 0 ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[color:var(--brand)] ring-2 ring-white" aria-label="Neuigkeiten" /> : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{name}</span>
            <span className="block text-xs text-[color:var(--muted)]">Profil &amp; Einstellungen</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm transition hover:bg-[color:var(--background)]"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
            {initials}
            {updatesUnread > 0 ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[color:var(--brand)] ring-2 ring-white" aria-label="Neuigkeiten" /> : null}
          </span>
          <span className="hidden font-medium sm:inline">{name}</span>
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
        </button>
      )}
      {open ? (
        <div
          className={cn(
            "absolute z-40 overflow-hidden rounded-xl border border-[color:var(--border)] bg-white py-1 shadow-lg",
            newUi ? "w-72 text-base [&_a]:min-h-11 [&_button]:min-h-11" : "w-60 text-sm",
            variant === "sidebar" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2",
          )}
        >
          <div className="border-b border-[color:var(--border)] px-3 py-2">
            <div className="font-semibold">{name}</div>
            <div className="text-xs text-[color:var(--muted)]">{owner ? (newUi ? "Inhaber-Zugang" : "Dein CRM") : "Berater-Zugang"}</div>
          </div>
          {newUi && owner && setupOpen > 0 ? (
            <Link
              href="/buyer/einrichtung"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
            >
              <ListChecks className="h-4 w-4" /> Einrichtung
              <span className="ml-auto">
                <Badge n={setupOpen} />
              </span>
            </Link>
          ) : null}
          <PushMenuItem />
          {absence ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("pg-absence-open"));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
            >
              <Plane className="h-4 w-4" />
              {absence.current ? (
                <span>
                  Abwesenheit ändern
                  <span className="block text-xs text-[color:var(--muted)]">
                    {absence.current.active ? `bis ${dayShort(absence.current.to)}` : `ab ${dayShort(absence.current.from)}`}
                  </span>
                </span>
              ) : (
                "Ich bin abwesend"
              )}
            </button>
          ) : null}
          {newUi ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new Event("pg-hilfe-open"));
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
            >
              <Sparkles className="h-4 w-4" /> Hilfe
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setFeedback(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
          >
            <MessageSquareText className="h-4 w-4" /> Etwas unklar? Feedback
          </button>
          <Link
            href="/buyer/neuigkeiten"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
          >
            <Megaphone className="h-4 w-4" /> Neuigkeiten
            {updatesUnread > 0 ? (
              <span className="ml-auto">
                <Badge n={updatesUnread} />
              </span>
            ) : null}
          </Link>
          {hasTeam || (newUi && !owner) ? (
            <Link
              href="/buyer/kalender"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
            >
              <CalendarDays className="h-4 w-4" /> Mein Kalender
            </Link>
          ) : null}
          {owner ? (
            <>
              <Link
                href="/buyer/team"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
              >
                <UsersRound className="h-4 w-4" /> Team
              </Link>
              <Link
                href="/buyer/konto"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
              >
                <CreditCard className="h-4 w-4" /> Konto &amp; Rechnungen
                {showNewBadge() ? (
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800" title="Neu: Zusatzmodul Empfehlungen & Bewertungen">
                    Neu
                  </span>
                ) : null}
              </Link>
              <Link
                href="/buyer/empfehlen"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
              >
                <Gift className="h-4 w-4" /> Kollegen empfehlen
              </Link>
            </>
          ) : null}
          <Link
            href="/buyer/konto/sicherheit"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
          >
            <ShieldCheck className="h-4 w-4" /> Anmeldung &amp; Sicherheit
          </Link>
          <Link
            href="/buyer/provisionen"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
          >
            <Percent className="h-4 w-4" /> Meine Provisionen
          </Link>
          <Link
            href="/buyer/vorlagen"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
          >
            <MessageSquareText className="h-4 w-4" /> WhatsApp-Vorlagen
          </Link>
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
          <a
            href="/sicherheit"
            target="_blank"
            rel="noopener"
            className="block px-3 py-2 text-[color:var(--muted)] hover:bg-[color:var(--background)]"
          >
            Sicherheit &amp; Datenschutz
          </a>
          <form action="/api/auth/logout" method="post" className="border-t border-[color:var(--border)]">
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)]"
            >
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
          </form>
        </div>
      ) : null}
      {feedback ? <FeedbackDialog onClose={() => setFeedback(false)} /> : null}
    </div>
  );
}

/**
 * Neue Oberfläche (Vertreter-A): vier Bereiche – Heute, Kontakte, Nachrichten,
 * Wachstum. Am Rechner eine Seitenleiste links, auf dem Handy Tabs unten.
 */
function BuyerShellA({
  pathname,
  displayName,
  showChats,
  chatBadge,
  setupOpen,
  teamRole,
  hasTeam,
  absence,
  updatesUnread,
  children,
}: {
  absence: ShellAbsence | null;
  updatesUnread: number;
  pathname: string;
  displayName: string;
  showChats: boolean;
  chatBadge: number;
  setupOpen: number;
  teamRole: "owner" | "advisor";
  hasTeam: boolean;
  children: React.ReactNode;
}) {
  const owner = teamRole === "owner";
  const items: NavItem[] = [
    ...(showChats || owner
      ? [{ href: "/buyer", label: showChats ? "Heute" : "Übersicht", icon: showChats ? Sun : LayoutDashboard, match: (p: string) => p === "/buyer" }]
      : []),
    { href: "/buyer/kontakte", label: "Kontakte", icon: Users, match: (p: string) => /^\/buyer\/(kontakte|leads|kanban)/.test(p) },
    ...(showChats
      ? [{ href: "/buyer/chats", label: "Nachrichten", icon: MessageCircle, match: (p: string) => p.startsWith("/buyer/chats"), badge: chatBadge }]
      : []),
    ...(owner
      ? [{ href: "/buyer/wachstum", label: "Wachstum", icon: TrendingUp, match: (p: string) => /^\/buyer\/(wachstum|zahlen|bestellen|bestand|empfehlungen)/.test(p) }]
      : []),
  ];
  const firstName = displayName.replace(/^Allianz\s+/i, "").split(/\s+/)[0] ?? "";

  return (
    <ToastProvider>
      <div className="min-h-dvh md:pl-60">
        {/* Rechner: Seitenleiste */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-[color:var(--border)] bg-white px-3 pb-3 pt-5 md:flex">
          <Link href="/buyer" className="mb-5 flex items-center gap-2 px-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-white">
              <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              performance<span className="text-[color:var(--brand)]">growth</span>
            </span>
          </Link>
          <Link
            href="/buyer/kontakte"
            className="mb-4 flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-3 text-sm text-[color:var(--muted)] hover:border-[color:var(--border-strong)]"
          >
            <Search className="h-4 w-4" /> Kontakt suchen
          </Link>
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
                      <Badge n={it.badge} />
                    </span>
                  ) : null}
                </Link>
              );
            })}
            {owner && setupOpen > 0 ? (
              <Link
                href="/buyer/einrichtung"
                className={cn(
                  "flex h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 text-[15px] font-medium transition",
                  pathname.startsWith("/buyer/einrichtung") ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--foreground)] hover:bg-[color:var(--surface-sunken)]",
                )}
              >
                <ListChecks className="h-[18px] w-[18px]" /> Einrichtung
                <span className="ml-auto">
                  <Badge n={setupOpen} />
                </span>
              </Link>
            ) : null}
          </nav>
          <div className="mt-auto space-y-2 border-t border-[color:var(--border)] pt-3">
            <HilfeChat firstName={firstName} owner={owner} variant="nav" />
            <ProfileMenu name={displayName} owner={owner} hasTeam={hasTeam} newUi setupOpen={setupOpen} variant="sidebar" absence={absence} updatesUnread={updatesUnread} />
          </div>
        </aside>

        {/* Handy: schmale Kopfzeile */}
        <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-white/90 backdrop-blur md:hidden">
          <div className="flex h-14 items-center gap-2 px-4">
            <Link href="/buyer" className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-white">
                <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <HilfeChat firstName={firstName} owner={owner} />
              <ProfileMenu name={displayName} owner={owner} hasTeam={hasTeam} newUi setupOpen={setupOpen} absence={absence} updatesUnread={updatesUnread} />
            </div>
          </div>
        </header>

        <div className="pb-20 md:pb-0">
          {absence ? <AbsenceControl data={absence} /> : null}
          <PushHint />
          {children}
        </div>

        {/* Handy: vier Bereiche unten */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Bereiche">
          <ul className="mx-auto flex max-w-md">
            {items.map((it) => {
              const active = it.match(pathname);
              const Icon = it.icon;
              return (
                <li key={it.href} className="flex-1">
                  <Link
                    href={it.href}
                    data-haptic="selection"
                    aria-current={active ? "page" : undefined}
                    className={cn("flex flex-col items-center gap-0.5 py-2 text-[12px] font-medium", active ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]")}
                  >
                    <span className="relative">
                      <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.9} />
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

/** „Etwas unklar?" – ein Satz genügt, die aktuelle Seite wird mitgeschickt. */
function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  // Per Portal an <body>: Die Kopfleiste hat backdrop-blur, das „fixed“ sonst an die Kopfleiste bindet.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center" onClick={onClose}>
      <div
        className="ui-fade-in w-full max-w-md rounded-[var(--radius-lg)] bg-white p-5 shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold">Etwas unklar oder umständlich?</h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Schreiben Sie uns kurz, was Sie gesucht oder erwartet haben. Wir verbessern die App laufend.
        </p>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="z. B. „Ich finde nicht, wo ich einen Termin verschiebe.“"
          className="mt-3 w-full resize-none rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/15"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-[var(--radius-sm)] px-4 text-sm text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]">
            Abbrechen
          </button>
          <button
            type="button"
            disabled={!text.trim() || sending}
            onClick={async () => {
              setSending(true);
              const ok = await sendUsage({ type: "feedback", text });
              setSending(false);
              onClose();
              toast.show(ok ? { message: "Danke! Wir schauen uns das an." } : { message: "Senden hat nicht geklappt.", tone: "error" });
            }}
            className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Senden
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
