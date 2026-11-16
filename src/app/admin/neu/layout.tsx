import { connection } from "next/server";
import { AdminNeuShell } from "@/components/admin-neu/rahmen/shell";
import { loadAdminNavCounts } from "@/lib/admin-heute";
import { requireAuth } from "@/lib/vertrieb/auth";

// Neuer Admin (/admin/neu/…), parallel zur alten Oberfläche (Schalter „Neue Oberfläche“ im Profilmenü).
//
// Layout-Weiche: Die alte Admin-Shell rendert nicht ein Layout, sondern SiteHeader im Root-Layout (je nach Rolle).
// Eine Route-Gruppe hilft dagegen nicht, ohne alle Admin-Seiten umzuhängen. Deshalb wie beim Kundenbereich:
// src/middleware.ts setzt für /admin/neu „x-app-area: admin-neu“, SiteHeader und SiteFooter lassen sich dann weg,
// und dieses Layout bringt die neue Shell mit. Die alten Seiten bleiben unverändert erreichbar.
export default async function AdminNeuLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await requireAuth();
  const zaehler = await loadAdminNavCounts(session.userId);
  return (
    <AdminNeuShell email={session.email} zaehler={zaehler}>
      {children}
    </AdminNeuShell>
  );
}
