import { requireAuth } from "@/lib/vertrieb/auth";
import { ZuordnenAnsicht } from "@/components/admin/zuordnen-ansicht";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Kosten zuordnen | performancegrowth Admin" };

// Neue Ausgaben zuordnen: Zweck wählen oder ignorieren; „immer so“ legt eine Regel an.
// Liste gemeinsam mit dem neuen Admin (components/admin/zuordnen-ansicht.tsx).
export default async function ZuordnenPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  await requireAuth();
  const ansicht = (await searchParams).ansicht === "alle" ? "alle" : "offen";
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-4 px-4 py-8 sm:px-6">
      <div>
        <AdminBack href="/admin/einstellungen/bank">Bank & Karten</AdminBack>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Kosten zuordnen</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Zweck wählen oder ignorieren. Mit „immer so“ werden künftige Buchungen mit demselben Muster automatisch so zugeordnet. Beträge sind brutto; mit „inkl. USt“ wird netto gerechnet.
        </p>
      </div>
      <ZuordnenAnsicht ansicht={ansicht} basis="/admin/einstellungen/bank/zuordnen" />
    </main>
  );
}
