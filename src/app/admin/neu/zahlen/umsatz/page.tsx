import { connection } from "next/server";
import { BuchungenAnsicht } from "@/components/admin/buchungen-ansicht";
import { ZahlenEinmalUmsatz, ZahlenOhneBetreuungsgebuehr } from "@/components/admin/zahlen-view";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadZahlen } from "@/lib/zahlen";

export const metadata = { title: "Umsatz & Buchungen | performancegrowth Admin" };

// Zahlen → Umsatz & Buchungen: Buchungsliste aller Kunden (wie /admin/zahlen/buchungen, gleiche Bausteine), dazu aus der
// alten Zahlen-Übersicht der Hinweis „Kunden ohne Betreuungsgebühr“ und die Einrichtungsgebühren mit „Einmal-Umsatz nachtragen“.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const session = await requireAuth();
  const sp = await searchParams;
  const data = await loadZahlen(new Date(), "gesamt");

  return (
    <Seite titel="Zahlen" reiter="zahlen" breit>
      <div className="space-y-5">
        <div data-funktion="zahlen-view--kunden-ohne-hinterlegte-betreuungsgebuehr" className="empty:hidden">
          <ZahlenOhneBetreuungsgebuehr data={data} />
        </div>
        <BuchungenAnsicht
          sp={sp}
          userId={session.userId}
          basis="/admin/neu/zahlen/umsatz"
          kopf={false}
          funktionen={{
            liste: "buchungen-liste--buchungsliste-aller-kunden-angebote-produkte",
            filter: "page--filter-kunde-art-status-zeitraum-offen page-q--suche-in-buchungen",
            export: "route-get--csv-export-buchungen",
          }}
        />
        <div data-funktion="actions-savemanualrevenueaction--einrichtungsgebuehren-je-monat-umsatz-von-hand actions-deletemanualrevenueaction--manuellen-umsatz-loeschen">
          <ZahlenEinmalUmsatz data={data} />
        </div>
      </div>
    </Seite>
  );
}
