import { AufgabenListe } from "@/components/admin/aufgaben-liste";
import { Seite } from "@/components/admin-neu/ui/seite";

export const metadata = { title: "Aufgaben | performancegrowth Admin" };

// Mein Tag → Aufgaben (Admin v2; Adresse bleibt unter /vertrieb, früher Heute → Aufgaben): dieselbe Liste wie /admin/heute/aufgaben, nur im neuen Rahmen.
// Zeilen-Aktionen (Erledigt, Später, Löschen, Anrufen) kommen aus components/vertrieb/task-row.tsx.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Seite titel="Aufgaben" zurueck={{ href: "/admin/neu", label: "Mein Tag" }}>
      <div
        data-funktion="page--aufgabenliste-gruppiert-ueberfaellig-heute page-view--ansicht-offen-oder-erledigt page-task-types--filter-nach-aufgabenart actions-createtask--aufgabe-anlegen-art-faellig-uhrzeit-auch-ohne actions-toggletask--aufgabe-erledigt-oder-wieder-oeffnen actions-snoozetask--aufgabe-auf-morgen-oder-in-1-woche-schieben actions-deletetask--aufgabe-loeschen task-row-actions--aus-aufgabe-anrufen-oder-kontakt-oeffnen"
      >
        <AufgabenListe basis="/admin/neu/vertrieb/aufgaben" searchParams={await searchParams} />
      </div>
    </Seite>
  );
}
