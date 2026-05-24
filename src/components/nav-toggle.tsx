"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

// Segment-Umschalter im Header, um zwischen KPI-Dashboard und Media Buyer
// hin- und herzuschalten. Nur für Admins gerendert.
export function NavToggle() {
  const pathname = usePathname();
  const onMediaBuyer = pathname.startsWith("/admin/media-buyer");

  const tabs = [
    { href: "/", label: "KPI-Dashboard", Icon: LayoutDashboard, active: !onMediaBuyer },
    {
      href: "/admin/media-buyer",
      label: "Media Buyer",
      Icon: Gauge,
      active: onMediaBuyer,
    },
  ];

  return (
    <nav className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border)] bg-[color:var(--brand-soft)]/40 p-0.5">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:text-sm",
            t.active
              ? "bg-white text-[color:var(--brand-dark)] shadow-sm"
              : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
          )}
        >
          <t.Icon className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">{t.label}</span>
        </Link>
      ))}
    </nav>
  );
}
