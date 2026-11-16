import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";
import { loadAdminNavCounts } from "@/lib/admin-heute";

export async function SiteHeader() {
  // Öffentliche Lead-Seiten (Buchung) ohne Dashboard-Header.
  const h = await headers();
  if (h.get("x-bare-layout")) return null;
  // Kundenbereich: eigene App-Shell (src/components/buyer-shell.tsx).
  if (h.get("x-app-area") === "buyer") return null;
  // Neuer Admin (/admin/neu): eigene Shell im Layout src/app/admin/neu/layout.tsx (Kennzeichen setzt src/middleware.ts).
  if (h.get("x-app-area") === "admin-neu") return null;
  const session = await getCurrentSession();
  // Admin: Seitenleiste am Rechner, Leiste unten am Handy (die alte Kopfzeile ist abgeschaltet).
  if (session?.role === "ADMIN") {
    return <AdminShell email={session.email} counts={await loadAdminNavCounts(session.userId)} />;
  }

  // Ohne Anmeldung (z. B. Passwort vergessen): nur das Logo.
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
      </div>
    </header>
  );
}
