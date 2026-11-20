import { connection } from "next/server";
import { ZuordnenAnsicht } from "@/components/admin/zuordnen-ansicht";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Ausgaben zuordnen | performancegrowth Admin" };

// Geld › Kosten › Ausgaben zuordnen (früher /admin/einstellungen/bank/zuordnen), gleicher Baustein.
// ?ansicht=alle zeigt auch die zugeordneten und ignorierten Ausgaben der letzten 90 Tage.
export default async function Page({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  await connection();
  await requireAuth();
  const ansicht = (await searchParams).ansicht === "alle" ? "alle" : "offen";
  return (
    <Seite titel="Ausgaben zuordnen" untertitel="Zweck wählen oder ignorieren; „künftig automatisch“ legt eine Regel an." zurueck={{ href: "/admin/neu/zahlen/kosten", label: "Kosten" }}>
      <div data-funktion="actions-assignaction--ausgabe-zuordnen-zweck-inkl-ust-immer-so-bei page--zugeordnete-ausgaben-ansehen">
        <ZuordnenAnsicht ansicht={ansicht} basis="/admin/neu/zahlen/kosten/zuordnen" />
      </div>
    </Seite>
  );
}
