import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Seite } from "@/components/admin-neu/ui/seite";
import { loadAccountDetail } from "@/lib/optimierung/server";
import { AccountView } from "@/app/admin/optimierung/account-view";

export const metadata = { title: "Werbekonto | performancegrowth Admin" };

// Werbekonten → ein Konto: geplante Maßnahmen (alle bzw. einzeln freigeben, ablehnen, erledigt), Lauf und
// Trockenlauf, Maßnahme von Hand, Einstellungen (Modus, Ziel-Leadpreis, Tagesbudget, Stichwort), Protokoll und
// Meta-Änderungsprotokoll. Inhalt wie /admin/optimierung/[id] (AccountView), Titel im Seitenkopf.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const detail = await loadAccountDetail(id);
  if (!detail) notFound();
  return (
    <Seite titel={detail.account.label} zurueck={{ href: "/admin/neu/leads/werbekonten", label: "Werbekonten" }} breit>
      <div data-funktion="actions-saveaccountaction--konto-modus-ziel-leadpreis-tagesbudget-kampagnen actions-approveallaction--alle-massnahmen-freigeben actions-approveoneaction--einzelne-massnahme-freigeben actions-rejectaction--massnahme-ablehnen-mit-notiz actions-doneaction--vorschlag-als-erledigt-markieren-mit-notiz actions-dryrunaction--trockenlauf-je-konto actions-runnowaction--lauf-jetzt-starten actions-syncactivitiesaction--meta-aenderungsprotokoll-abrufen-30-tage account-view-protocolcard--protokoll-je-konto-quelle-monatsbericht">
        <AccountView detail={detail} showBackLink={false} ohneTitel einklappen />
      </div>
    </Seite>
  );
}
