import Link from "next/link";
import { LogOut, TrendingUp } from "lucide-react";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin-tabs";
import { logoutAction } from "@/app/login/actions";

export async function SiteHeader() {
  // Öffentliche Lead-Seiten (Buchung) ohne Dashboard-Header.
  const h = await headers();
  if (h.get("x-bare-layout")) return null;
  // Kundenbereich: eigene App-Shell (src/components/buyer-shell.tsx).
  if (h.get("x-app-area") === "buyer") return null;
  const session = await getCurrentSession();
  const isAdmin = session?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-white">
            <TrendingUp className="h-3.5 w-3.5" strokeWidth={2.75} />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:inline">
            performance<span className="text-[color:var(--brand)]">growth</span>
          </span>
        </Link>
        {isAdmin ? (
          <>
            <div className="h-full min-w-0 flex-1">
              <AdminNav />
            </div>
            <form action={logoutAction} className="shrink-0">
              <button
                type="submit"
                title="Abmelden"
                className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-sm text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)]"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline">Abmelden</span>
              </button>
            </form>
          </>
        ) : null}
      </div>
    </header>
  );
}
