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

/** Marketing liegt im Vertrieb (Ole, 16.11.2026): Reiter „Marketing“ oben, darunter diese Auswahl. */
export function MarketingNav() {
  const path = usePathname() ?? "";
  const ref = useActiveTabInView<HTMLDivElement>(path);
  return (
    <nav ref={ref} aria-label="Marketing" className="mb-5 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition",
              active
                ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {l.label}
          </Link>
        );
      })}
      <a href="/rechner" target="_blank" rel="noopener" className="inline-flex h-10 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium text-[color:var(--brand)] hover:underline">
        Rechner öffnen ↗
      </a>
    </nav>
  );
}
