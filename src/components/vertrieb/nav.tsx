"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const BASE = "/admin/vertrieb";
const LINKS = [
  { href: BASE, label: "Heute" },
  { href: `${BASE}/aufgaben`, label: "Aufgaben" },
  { href: `${BASE}/kontakte`, label: "Kontakte" },
  { href: `${BASE}/pipeline`, label: "Akquise-Pipeline" },
  { href: `${BASE}/kunden`, label: "Kunden" },
  { href: `${BASE}/import`, label: "Import & Instantly" },
];

export function VertriebNav({ dueCount }: { dueCount: number }) {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        <span className="mr-3 text-sm font-semibold tracking-tight">Vertrieb</span>
        {LINKS.map((l) => {
          const active = l.href === BASE ? path === BASE : path.startsWith(l.href);
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
      </div>
    </nav>
  );
}
