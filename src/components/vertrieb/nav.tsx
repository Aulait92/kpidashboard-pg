"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const BASE = "/admin/vertrieb";
// Heute, Kunden und Import liegen im Hauptmenü bzw. in den Einstellungen.
const LINKS = [
  { href: `${BASE}/kontakte`, label: "Kontakte" },
  { href: `${BASE}/pipeline`, label: "Akquise-Pipeline" },
  { href: `${BASE}/aufgaben`, label: "Aufgaben" },
];

export function VertriebNav({ dueCount }: { dueCount: number }) {
  const path = usePathname();
  // Auf „Heute“ und im Import (Einstellungen) keine Unternavigation.
  if (path === BASE || path.startsWith(`${BASE}/import`)) return null;
  return (
    <nav className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {LINKS.map((l) => {
          const active = path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium",
                active
                  ? "bg-[color:var(--brand)] text-white"
                  : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)]",
              )}
            >
              {l.label}
              {l.href === `${BASE}/aufgaben` && dueCount > 0 && (
                <span className={clsx("badge", active ? "bg-white text-[color:var(--brand)]" : "bg-rose-600 text-white")}>{dueCount}</span>
              )}
            </Link>
          );
        })}
        <a href="/rechner" target="_blank" rel="noopener" className="ml-auto whitespace-nowrap px-3 py-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
          Rechner öffnen ↗
        </a>
      </div>
    </nav>
  );
}
