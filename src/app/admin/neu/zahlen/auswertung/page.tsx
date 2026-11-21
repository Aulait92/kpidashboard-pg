import { connection } from "next/server";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Auswertung, ExportKnoepfe } from "@/components/admin-neu/zahlen/auswertung";
import { loadInvestoren, parseInvestorSicht } from "@/lib/investoren/server";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Für Investoren | performancegrowth Admin" };

// Geld › Übersicht › Für Investoren (Detailseite ohne Reiter seit 19.11.2026): Investoren-Kennzahlen (MRR, Bindung 3/6/12, NRR, Marge mit KI-Kosten, CAC und Amortisation,
// Kundenwert, Kohorten ab 5 Kunden, Abo vs. Pay-per-Lead) mit Export als PDF und CSV. ?sicht=kern (Standard, wie die
// Investoren-Ansicht der Übersicht) oder ?sicht=gesamt. Rechnung: lib/investoren, Diagnose q=investoren.
export default async function Page({ searchParams }: { searchParams: Promise<{ sicht?: string }> }) {
  await connection();
  await requireAuth();
  const { sicht } = await searchParams;
  const d = await loadInvestoren(new Date(), parseInvestorSicht(sicht));
  return (
    <Seite titel="Für Investoren" zurueck={{ href: "/admin/neu/zahlen", label: "Übersicht" }} aktionen={<ExportKnoepfe sicht={d.sicht} />}>
      <Auswertung d={d} />
    </Seite>
  );
}
