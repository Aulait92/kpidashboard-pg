import { connection } from "next/server";
import { LebenszyklusAnsicht } from "@/components/admin/lebenszyklus-ansicht";
import { Seite } from "@/components/admin-neu/ui/seite";
import { loadLebenszyklus } from "@/lib/lebenszyklus";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Kündigung & Rückkehr | performancegrowth Admin" };

// Geld › Übersicht › Kunden › Kündigung & Rückkehr (Detailseite ohne Reiter seit 19.11.2026): Kündigung, Ruhephase, Rückkehr und Halteangebote (wie /admin/zahlen/lebenszyklus,
// gleicher Baustein components/admin/lebenszyklus-ansicht.tsx). Kohorten und Kundenbasis stehen in der Übersicht.
export default async function Page() {
  await connection();
  await requireAuth();
  const d = await loadLebenszyklus();
  return (
    <Seite titel="Kündigung & Rückkehr" zurueck={{ href: "/admin/neu/zahlen", label: "Übersicht" }} breit>
      <LebenszyklusAnsicht
        d={d}
        funktionen={{
          monate: "page--kunden-je-monat-neu-reaktiviert-gekuendigt-netto",
          mrr: "page--mrr-bewegung-je-monat",
          quote: "page--reaktivierungsquote-je-kuendigungsmonat",
          gruende: "page--kuendigungsgruende-die-zurueckkommen",
          halte: "page--halteangebote-angenommen-mrr-gerettet-spaeter",
        }}
      />
    </Seite>
  );
}
