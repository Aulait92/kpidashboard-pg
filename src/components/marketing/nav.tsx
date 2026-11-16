"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useActiveTabInView } from "@/components/admin/sub-tabs";

const BASE = "/admin/marketing";
const LINKS = [
  { href: `${BASE}/linkedin`, label: "LinkedIn" },
  { href: `${BASE}/empfehlungen`, label: "Empfehlungen" },
  { href: `${BASE}/unterlagen`, label: "Unterlagen" },
];

export function MarketingNav() {
  const path = usePathname() ?? "";
  const ref = useActiveTabInView<HTMLDivElement>(path);
  return (
    <nav className="sticky top-0 z-20 border-b border-[color:var(--border)] bg-white/90 backdrop-blur">
      <div ref={ref} className="mx-auto flex max-w-[1600px] items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 lg:px-8">
        {LINKS.map((l) => {
          const active = path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                // Gleiche Reiter wie überall im Admin (SubTabs): Unterstrich, 44 px hoch
                "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition",
                active ? "border-[color:var(--brand)] text-[color:var(--foreground)]" : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
              )}
            >
              {l.label}
            </Link>
          );
        })}
        <a href="/rechner" target="_blank" rel="noopener" className="ml-auto flex min-h-11 items-center whitespace-nowrap px-3 text-sm font-medium text-[color:var(--brand)] hover:underline">
          Rechner öffnen ↗
        </a>
      </div>
    </nav>
  );
}
