"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Reiter innerhalb einer Seite (statt weiterer Punkte im Hauptmenü). */
export function SubTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean; count?: number }[] }) {
  const pathname = usePathname() ?? "/";
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[color:var(--border)]">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
              active
                ? "border-[color:var(--brand)] text-[color:var(--foreground)]"
                : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {t.label}
            {t.count ? <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">{t.count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
