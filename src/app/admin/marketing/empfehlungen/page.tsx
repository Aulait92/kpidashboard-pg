import Link from "next/link";
import { Settings } from "lucide-react";
import { requireAuth } from "@/lib/vertrieb/auth";
import { EmpfehlungenAnsicht } from "@/components/admin/empfehlungen-ansicht";

export const metadata = { title: "Empfehlungen | Vertrieb" };
export const dynamic = "force-dynamic";

// „Kollegen empfehlen“: alle Empfehlungen, Top-Empfehler, offene Prämien. Inhalt gemeinsam mit dem neuen Admin
// (components/admin/empfehlungen-ansicht.tsx).
export default async function EmpfehlungenPage() {
  await requireAuth();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empfehlungen</h1>
          <p className="text-sm text-[color:var(--muted)]">Kunden empfehlen uns an Kollegen („Kollegen empfehlen“ im Kundenbereich).</p>
        </div>
        <Link href="/admin/einstellungen/empfehlungen" className="inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
          <Settings className="h-4 w-4" /> Prämie & Vorteil einstellen
        </Link>
      </div>

      <EmpfehlungenAnsicht />
    </div>
  );
}
