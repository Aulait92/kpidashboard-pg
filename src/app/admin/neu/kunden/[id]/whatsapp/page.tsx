import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import KundenWhatsApp from "@/app/admin/kunden/[id]/whatsapp/page";

export const metadata = { title: "WhatsApp | performancegrowth Admin" };

const GCAL: Record<string, string> = {
  connected: "Kalender erfolgreich verbunden.",
  denied: "Kalender-Verbindung abgebrochen.",
  consent: "Microsoft verlangt eine Administrator-Freigabe: Die IT des Kunden muss die App im Firmen-Tenant einmalig genehmigen.",
};

// Funktionen der WhatsApp-Einstellungen je Kunde (app/admin/whatsapp/settings, eingebettet mit ?kunde=) und des alten
// Reiters (360dialog, Verfügbarkeit, Meta-Gebühren, Bestandskunden). Push-Ziele „Verbindung prüfen“, „Kalender fehlt“,
// „Vorlage abgelehnt“ zeigen auf /admin/kunden/<id>/whatsapp und landen über umzug.ts hier.
const FUNKTIONEN = [
  "actions-addcustomeraction--kunde-fuer-den-assistenten-hinzufuegen",
  "actions-connectwhatsappaction--whatsapp-nummer-von-hand-verbinden-nummer-api",
  "actions-setagentactiveaction--assistent-aktiv-an-aus",
  "actions-saveagentsettingsaction--neue-leads-automatisch-anschreiben-nach-x",
  "actions-setnewcontactsbotaction--assistent-auch-fuer-neue-kontakte-sonst-nur",
  "actions-setfollowupsequencesaction--automatisch-nachfassen-abfolgen-an-aus",
  "actions-saveagentsettingsaction--berater-e-mail-fuer-einladungen-videoraum",
  "actions-saveoutreachsettingsaction--erstanschreiben-einstellungen-alt-ohne",
  "calendar-card-calendarcard--buchungskalender-google-microsoft-verbinden",
  "controls-templateautostatus--vorlagen-des-kunden-ansehen-status-bei-meta",
  "actions-savetemplateresultaction--vorlage-anlegen-bearbeiten-mit-zweck",
  "actions-deletetemplateaction--vorlage-loeschen",
  "actions-submittemplatesaction--vorlagen-bei-meta-einreichen-bzw-einzeln-neu",
  "actions-settemplateapprovedaction--vorlage-von-hand-als-freigegeben-markieren",
  "d360-actions-d360assignaction--360dialog-nummer-zuordnen",
  "d360-actions-d360resetaction--halb-fertige-whatsapp-verbindung-zuruecksetzen",
  "calendar-actions-adminconnectallianzaction--allianz-online-kalender-verbinden-aendern",
  "calendar-actions-adminsaveleadtimesaction--buchbare-zeiten-fuer-leads-speichern",
  "calendar-actions-adminaddblockaction--zeit-blockieren-und-blocker-loeschen",
  "whatsapp-fees-card--meta-gebuehren-intern",
  "page-bestandmodulecard--bestandskunden-kampagnen-hinweis-link-abrechnung",
  "self-connect--push-an-admins-mit-sprungziel-whatsapp",
].join(" ");

// Kundenakte › WhatsApp: Nummer, Assistent, Kalender, Vorlagen, Verfügbarkeit, Meta-Gebühren. Derselbe Inhalt wie
// /admin/kunden/[id]/whatsapp (dort eingebettet), dazu die Rückmeldung nach dem Verbinden eines Kalenders.
export default async function KundeWhatsApp({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ wa?: string; gcal?: string }> }) {
  const { id } = await params;
  const { wa, gcal } = await searchParams;
  return (
    <KundenakteSeite id={id}>
      {gcal ? (
        <p
          data-funktion="page-gcal--rueckmeldung-kalender-verbunden-abgelehnt"
          className={`mb-4 rounded-[var(--radius-md)] px-4 py-2.5 text-sm ring-1 ${gcal === "connected" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200"}`}
        >
          {GCAL[gcal] ?? "Kalender-Verbindung fehlgeschlagen, bitte erneut versuchen."}
        </p>
      ) : null}
      <div data-funktion={FUNKTIONEN}>
        <KundenWhatsApp params={Promise.resolve({ id })} searchParams={Promise.resolve({ wa })} />
      </div>
    </KundenakteSeite>
  );
}
