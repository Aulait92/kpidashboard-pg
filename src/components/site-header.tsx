import Link from "next/link";
import { TrendingUp } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--brand)] text-white shadow-sm">
            <TrendingUp className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="text-base font-semibold tracking-tight">
            <span className="text-[color:var(--foreground)]">performance</span>
            <span className="text-[color:var(--brand)]">growth</span>
          </span>
        </Link>
        <span className="text-sm font-medium text-[color:var(--muted)]">
          KPI-Dashboard
        </span>
      </div>
    </header>
  );
}
