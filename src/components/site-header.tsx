import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { headers } from "next/headers";
import { getCurrentSession } from "@/lib/auth";
import { AdminNav } from "@/components/admin-tabs";
import { AdminProfileMenu } from "@/components/admin/admin-profile-menu";
import { AdminShell } from "@/components/admin/admin-shell";
import { CommandPalette } from "@/components/command-palette";
import { loadAdminNavCounts } from "@/lib/admin-heute";
import { isAdminNewUi } from "@/lib/admin-ui";

export async function SiteHeader() {
  // Öffentliche Lead-Seiten (Buchung) ohne Dashboard-Header.
  const h = await headers();
  if (h.get("x-bare-layout")) return null;
  // Kundenbereich: eigene App-Shell (src/components/buyer-shell.tsx).
  if (h.get("x-app-area") === "buyer") return null;
  const session = await getCurrentSession();
  const isAdmin = session?.role === "ADMIN";
  // Neue Admin-Oberfläche (Admin-A): Seitenleiste statt Kopfzeile.
  if (session && isAdmin && (await isAdminNewUi())) {
    return <AdminShell email={session.email} counts={await loadAdminNavCounts()} />;
  }

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
            <CommandPalette />
            <div className="shrink-0">
              <AdminProfileMenu email={session?.email ?? ""} newUi={false} />
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
