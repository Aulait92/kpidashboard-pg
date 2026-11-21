"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect } from "react";
import { TrendingUp } from "lucide-react";
import { BEREICHE, NEU, bereichFuer, type NeuBereich } from "@/lib/admin-neu/navigation";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import type { NavZaehler } from "@/lib/admin-neu/rollen-server";
import type { Rolle } from "@/lib/admin-neu/rollen";
import { cn } from "@/lib/utils";
import { AdminNutzungMessung } from "@/components/admin/nutzung-messung";
import { BEREICH_SYMBOL } from "./symbole";
import { NeuMenue } from "./neu-menue";
import { ProfilMenue } from "./profil-menue";
import { Suche } from "./suche";

// Rahmen des neuen Admins (/admin/neu; Admin v2 nach Rollen, Ole 17.11.2026, Vorlage docs/ux/admin-v2/demo.html):
// Rechner: Seitenleiste mit „Mein Tag“, den vier Rollen (Verkaufen, Betreuen, Liefern, Geld) und unten Einstellungen
// und Profil; oben Suche und „+ Neu“.
// Handy: Kopfzeile mit Suche, „+ Neu“, Profil; unten Mein Tag und die vier Rollen (5 Punkte, kein „Mehr“, wie /buyer).
// Werkzeuge (Technik) und „Was wo ist“ liegen im Profilmenü (Umbau 20.11.2026, SUS 90+); auf ihren Seiten ist in der
// Seitenleiste „Einstellungen“ markiert.
// Bereiche und Seiten: src/lib/admin-neu/navigation.ts. data-admin-shell → Abstände aus globals.css (wie die alte Shell).

export type { NavZaehler } from "@/lib/admin-neu/rollen-server";

/** Zähler: „Mein Tag“ in Markenfarbe (offene Punkte), Rollen dezent (wie in der Demo). */
function Zahl({ n, dezent }: { n: number; dezent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none tabular-nums",
        dezent ? "border border-[color:var(--border)] bg-[color:var(--surface-sunken)] text-[color:var(--muted)]" : "bg-[color:var(--brand)] text-white",
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Zähler aus einer Quelle (lib/admin-neu/rollen-server.ts): Mein Tag = alle Punkte, Rollen = ihre Punkte. */
const zaehlerVon = (b: NeuBereich, z: NavZaehler) => (b.id === "mein-tag" ? z.heute : (z.rollen[b.id as Rolle] ?? 0));

/** Inventar-ids der Zähler (Nutzungsmessung): Mein Tag (früher Heute) und Betreuen (früher Chats). */
const ZAEHLER_FUNKTION: Partial<Record<string, string>> = {
  "mein-tag": "admin-shell-count--zaehler-badge-an-heute-offene-punkte",
  betreuen: "admin-shell-count--zaehler-badge-an-chats-offene-whatsapp",
};

/**
 * Links auf alte Admin-Seiten führen innerhalb der neuen Oberfläche auf die neue Seite, sobald sie fertig ist
 * (umzug.ts, `fertig` in navigation.ts). So zeigen wiederverwendete Bausteine (Heute-Liste usw.) automatisch
 * auf neue Seiten, ohne dass jeder Link einzeln angepasst wird.
 */
function useUmzugLinks() {
  const router = useRouter();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/admin/") || href.startsWith(NEU)) return;
      const ziel = neuerPfad(href);
      if (!ziel) return;
      e.preventDefault();
      e.stopPropagation();
      router.push(ziel);
    };
    // Capture-Phase: vor dem Klick-Handler von next/link
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router]);
}

function Logo({ mitName }: { mitName?: boolean }) {
  return (
    <Link href={NEU} className="-m-1.5 flex min-h-10 min-w-10 items-center gap-2 p-1.5" aria-label="Zu Mein Tag" data-funktion="admin-shell-logo--logo-fuehrt-zu-heute">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-white">
        <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
      </span>
      {mitName ? (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight">
            performance<span className="text-[color:var(--brand)]">growth</span>
          </span>
          <span className="block text-xs text-[color:var(--muted)]">Admin</span>
        </span>
      ) : null}
    </Link>
  );
}

function SeitenleistenLink({ b, aktiv, zaehler }: { b: NeuBereich; aktiv: boolean; zaehler: number }) {
  const Icon = BEREICH_SYMBOL[b.id];
  return (
    <Link
      href={b.pfad}
      aria-current={aktiv ? "page" : undefined}
      data-bereich={b.id}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-3 py-1.5 text-[15px] font-medium leading-tight transition",
        aktiv ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)]",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={aktiv ? 2.3 : 1.9} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{b.label}</span>
        {b.hinweis ? <span className={cn("block truncate text-xs font-normal", aktiv ? "text-[color:var(--brand-dark)]/75" : "text-[color:var(--muted)]/80")}>{b.hinweis}</span> : null}
      </span>
      {zaehler ? (
        <span data-funktion={ZAEHLER_FUNKTION[b.id]}>
          <Zahl n={zaehler} dezent={b.id !== "mein-tag"} />
        </span>
      ) : null}
    </Link>
  );
}

export function AdminNeuShell({ email, zaehler, children }: { email: string; zaehler: NavZaehler; children: React.ReactNode }) {
  const pathname = usePathname() ?? NEU;
  const aktuell = bereichFuer(pathname);
  useUmzugLinks();

  const oben = BEREICHE.filter((b) => b.ort === "oben");
  const unten = BEREICHE.filter((b) => b.ort === "unten");
  const leiste = BEREICHE.filter((b) => b.handy === "leiste");
  // Seiten aus dem Profilmenü (Werkzeuge, Was wo ist) markieren „Einstellungen“
  const aktivId = aktuell?.ort === "profil" ? "einstellungen" : aktuell?.id;

  return (
    <div data-admin-shell="" data-admin-neu="" className="flex min-h-dvh flex-1 flex-col">
      <AdminNutzungMessung />
      {/* Rechner: Seitenleiste */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-[color:var(--border)] bg-white px-3 pb-3 pt-5 lg:flex">
        <div className="mb-5 px-2">
          <Logo mitName />
        </div>
        <nav className="space-y-0.5" aria-label="Bereiche" data-funktion="admin-shell-adminareas--seitenleiste-mit-bereichen-heute-vertrieb-kunden">
          {oben.map((b, i) => (
            <Fragment key={b.id}>
              {/* „Mein Tag“ allein oben, darunter die Rollen */}
              {i === 1 ? <div className="px-3 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]/80">Rollen</div> : null}
              <SeitenleistenLink b={b} aktiv={aktivId === b.id} zaehler={zaehlerVon(b, zaehler)} />
            </Fragment>
          ))}
        </nav>
        <nav className="mt-auto space-y-0.5 pt-3" aria-label="Einstellungen">
          {unten.map((b) => (
            <SeitenleistenLink key={b.id} b={b} aktiv={aktivId === b.id} zaehler={zaehlerVon(b, zaehler)} />
          ))}
          <div className="pt-2">
            <ProfilMenue email={email} variant="sidebar" />
          </div>
        </nav>
      </aside>

      {/* Kopfzeile: Rechner Suche + Neu, Handy zusätzlich Logo und Profil */}
      <header className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-[color:var(--background)]/90 backdrop-blur">
        <div className="hidden h-16 items-center gap-3 px-8 lg:flex">
          <Suche variante="breit" />
          <div className="flex-1" />
          <NeuMenue variante="breit" />
        </div>
        <div className="flex h-14 items-center gap-2 px-4 lg:hidden">
          <Logo />
          <Suche variante="kopf" />
          <NeuMenue variante="kopf" />
          <ProfilMenue email={email} />
        </div>
      </header>

      <div className="flex-1">{children}</div>

      {/* Handy: Leiste unten */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--border)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        aria-label="Bereiche"
        data-funktion="admin-shell-mobilenav--handy-leiste-unten-mit-allen-bereichen"
      >
        <ul className="mx-auto flex max-w-lg">
          {leiste.map((b) => {
            const aktiv = aktuell?.id === b.id;
            const Icon = BEREICH_SYMBOL[b.id];
            // Handy wie in der Demo: nur „Mein Tag“ mit Zähler
            const z = b.id === "mein-tag" ? zaehler.heute : 0;
            return (
              <li key={b.id} className="min-w-0 flex-1">
                <Link
                  href={b.pfad}
                  data-haptic="selection"
                  aria-current={aktiv ? "page" : undefined}
                  className={cn("flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium", aktiv ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]")}
                >
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={aktiv ? 2.4 : 1.9} />
                    {z ? (
                      <span className="absolute -right-3 -top-1.5">
                        <Zahl n={z} />
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-full truncate">{b.kurz}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
