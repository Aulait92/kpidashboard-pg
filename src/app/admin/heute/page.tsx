import { connection } from "next/server";
import { HEUTE_FILTERS, summary } from "@/lib/admin-heute";
import { ladeHeuteSeite } from "@/lib/admin-heute-laden";
import { requireAuth } from "@/lib/vertrieb/auth";
import { VertriebBlick } from "@/components/admin/vertrieb-blick";
import { HeuteList } from "@/components/admin/heute-list";
import { HeuteAllesErledigt, HeuteFilterChips, HochrechnungKarte, LaeuftVonAllein, NeueBuchungenHinweis } from "@/components/admin/heute-bausteine";

export const metadata = { title: "Heute | performancegrowth Admin" };

// Startseite der Admin-Oberfläche: alles, was Sie heute brauchen, aus allen Bereichen in einer Liste – mit einem
// Knopf direkt zur richtigen Stelle. Seit 16.11.2026 auch Freigaben, Chats und „Vertrieb“ (früher Vertrieb → Übersicht).
export default async function AdminHeutePage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  await connection();
  const session = await requireAuth();
  const { bereich = "" } = await searchParams;
  const { items, auto, forecast, neueBuchungen } = await ladeHeuteSeite(session.userId);
  const filter = HEUTE_FILTERS.find((f) => f.key === bereich) ?? HEUTE_FILTERS[0];
  const shown = items.filter(filter.match);

  return (
    <>
      <p className="-mt-1 mb-4 text-sm text-[color:var(--muted)]">{summary(items)}</p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section aria-label="Braucht Sie">
          <HeuteFilterChips items={items} aktiv={filter.key} basis="/admin/heute" />
          {shown.length ? <HeuteList items={shown} /> : <HeuteAllesErledigt gefiltert={items.length > 0} />}
        </section>

        <div className="space-y-6">
          <VertriebBlick highlight={bereich === "vertrieb"} />
          <NeueBuchungenHinweis anzahl={neueBuchungen} />
          <LaeuftVonAllein auto={auto} />
          <HochrechnungKarte rows={forecast?.rows} />
        </div>
      </div>
    </>
  );
}
