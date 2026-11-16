"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Aktiven Reiter in einer quer scrollenden Leiste sichtbar halten (am Handy lag er sonst abgeschnitten rechts außen). */
export function useActiveTabInView<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const box = ref.current;
    const active = box?.querySelector<HTMLElement>("[aria-current='page']");
    if (!box || !active || box.scrollWidth <= box.clientWidth) return;
    const left = active.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + active.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = Math.max(0, left - 16);
    }
  }, [dep]);
  return ref;
}

/** Reiter innerhalb einer Seite (statt weiterer Punkte im Hauptmenü). */
export function SubTabs({ tabs }: { tabs: { href: string; label: string; exact?: boolean; count?: number; /** weitere Adressen, auf denen der Reiter aktiv ist */ also?: string[] }[] }) {
  const pathname = usePathname() ?? "/";
  const ref = useActiveTabInView<HTMLDivElement>(pathname);
  return (
    <div ref={ref} className="mb-5 flex gap-1 overflow-x-auto border-b border-[color:var(--border)] [scrollbar-width:none]">
      {tabs.map((t) => {
        const active =
          (t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`)) ||
          !!t.also?.some((a) => pathname === a || pathname.startsWith(`${a}/`));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              // 40 px hohe Tippfläche wie im Kundenbereich
              "-mb-px inline-flex min-h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition",
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
