"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActiveTabInView } from "@/components/admin/sub-tabs";
import { cn } from "@/lib/utils";

/** Zweite Reiter-Leiste unter den Reitern einer Rolle (z. B. Verkaufen › Marketing: LinkedIn, Empfehlungen …),
 *  im Aussehen der Chips im neuen Admin (components/admin-neu/kunden/chips.tsx, Ansichten auf Pay-per-Lead). */
export function UnterReiter({ tabs }: { tabs: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname() ?? "/";
  const ref = useActiveTabInView<HTMLDivElement>(pathname);
  return (
    <div ref={ref} className="-mx-4 -mt-2 mb-5 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0" aria-label="Unterseiten">
      {tabs.map((t) => {
        const aktiv = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={aktiv ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition",
              aktiv
                ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
