"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useActiveTabInView } from "@/components/admin/sub-tabs";

const BASE = "/admin/vertrieb";
// Kunden und Import liegen im Hauptmenü bzw. in den Einstellungen.
// Admin-Makeover Runde 2 (Ole, 16.11.2026): „Übersicht“ und „Aufgaben“ gehen in Heute auf
// (Weiterleitungen in src/lib/admin-bereiche.ts), Marketing kommt als Reiter in den Vertrieb.
export const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: `${BASE}/kontakte`, label: "Kontakte" },
  { href: `${BASE}/pipeline`, label: "Akquise-Pipeline" },
  { href: `${BASE}/follow-ups`, label: "Follow-ups" },
  { href: `${BASE}/angebote`, label: "Angebote" },
  // Termin-Übersicht (Ole, 18.11.2026) gibt es nur im neuen Admin: die Seite leitet nach Verkaufen → Termine weiter
  { href: `${BASE}/termine`, label: "Termine" },
  // Datenschutz und Recht (Ole, 19.11.2026): Fälle aus der Kaltakquise mit Frist und Nachweis
  { href: `${BASE}/datenschutz`, label: "Datenschutz" },
  { href: "/admin/marketing", label: "Marketing" },
];

export function VertriebNav() {
  const path = usePathname();
  const ref = useActiveTabInView<HTMLDivElement>(path);
  // Im Import (Einstellungen) keine Unternavigation.
  if (path.startsWith(`${BASE}/import`)) return null;
  return (
    <nav className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-white/90 backdrop-blur">
      <div ref={ref} className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:px-8">
        {LINKS.map((l) => {
          const active = "exact" in l ? path === l.href : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                // Gleiche Reiter wie überall im Admin (SubTabs): Unterstrich, 44 px hoch
                "-mb-px flex min-h-11 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition",
                active
                  ? "border-[color:var(--brand)] text-[color:var(--foreground)]"
                  : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
