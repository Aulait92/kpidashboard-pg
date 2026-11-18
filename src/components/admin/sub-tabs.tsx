"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** Breite des Verlaufs am Rand einer quer scrollenden Leiste (px). */
const VERLAUF = 28;

/**
 * Maske für eine quer scrollende Leiste: blendet den Rand aus, an dem noch Reiter folgen (Usability-Check 18.11.2026:
 * am Handy war nicht zu sehen, dass die Reiter weitergehen). Ohne Überlauf keine Maske.
 */
export function kantenMaske(o: { scrollLeft: number; scrollWidth: number; clientWidth: number }): string | null {
  if (o.scrollWidth <= o.clientWidth + 1) return null;
  const links = o.scrollLeft > 1;
  const rechts = o.scrollLeft + o.clientWidth < o.scrollWidth - 1;
  if (!links && !rechts) return null;
  return `linear-gradient(to right, ${links ? "transparent" : "#000"} 0, #000 ${links ? VERLAUF : 0}px, #000 calc(100% - ${rechts ? VERLAUF : 0}px), ${rechts ? "transparent" : "#000"} 100%)`;
}

/**
 * Aktiven Reiter in einer quer scrollenden Leiste sichtbar halten (am Handy lag er sonst abgeschnitten rechts außen) und
 * den Rand mit weiteren Reitern ausblenden (kantenMaske).
 */
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
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const setzen = () => {
      const m = kantenMaske(box) ?? "";
      box.style.maskImage = m;
      box.style.setProperty("-webkit-mask-image", m);
    };
    setzen();
    box.addEventListener("scroll", setzen, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(setzen);
    ro?.observe(box);
    return () => {
      box.removeEventListener("scroll", setzen);
      ro?.disconnect();
    };
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
