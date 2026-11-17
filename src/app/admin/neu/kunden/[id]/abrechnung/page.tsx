import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { GarantienCard } from "@/components/admin/garantien-card";
import KundenAbrechnung from "@/app/admin/kunden/[id]/abrechnung/page";

export const metadata = { title: "Abrechnung & Pause | performancegrowth Admin" };

// Bausteine und Actions von /admin/kunden/[id]/abrechnung (Weiterleitung nach dem Speichern führt über
// components/admin-neu/ui/rueckweg.ts hierher zurück). Push-Ziele (Kündigung, Reaktivierung, Module, Verkäufer) zeigen auf
// /admin/kunden/<id>/abrechnung und landen über umzug.ts hier.
const FUNKTIONEN = [
  "page--hinweis-zahlung-offen-seit",
  "lebenszyklus-card--kuendigung-rueckkehr-ruht-seit-reaktiviert",
  "retainer-actions-saveretaineraction--betreuungsgebuehr-eintragen-aendern-entfernen",
  "retainer-card--kuendigungsabsichten-und-angebotene",
  "budget-actions-decidebudgetaction--budgetaenderung-des-kunden-uebernehmen",
  "budget-actions-decidebudgetaction--budgetaenderung-ablehnen",
  "produkt-actions-decideproductaction--produktbuchung-des-kunden-annehmen-oder-ablehnen",
  "addon-actions-saveseatsaction--aktive-verkaeufer-speichern-und-mit-stripe",
  "addon-actions-bestandmoduleaction--bestandskunden-modul-freischalten-kostenlos",
  "addon-actions-savequotaaction--kontingent-bestandskunden-speichern-zusatzpakete",
  "addon-actions-empfehlungmoduleaction--modul-empfehlungen-bewertungen-freischalten-oder",
  "addon-actions-billingintervalaction--zahlweise-monatlich-jaehrlich-umstellen",
  "onboarding-actions-adminplanpauseaction--pause-urlaub-eintragen-ab-neustart-grund",
  "onboarding-actions-adminendpauseaction--pause-beenden",
  "erase-actions-erasecustomerdataaction--kundendaten-endgueltig-loeschen-mit-grund",
  "page-invoices--rechnungen-mit-status-und-pdf",
  "page--in-stripe-oeffnen",
  "zahlweise-card--zahlweise-und-mahnungen-offene-posten-des-kunden",
  "zahlweise-actions--ueberweisung-erlauben-zahlungsziel",
  "zahlweise-actions--mahnungen-je-kunde-stoppen",
  "ruhend--push-an-admins-mit-sprungziel-kundenakte",
].join(" ");

// Kundenakte › Abrechnung & Pause: Kündigung & Rückkehr, Betreuungsgebühr, Werbebudget, Produkte, Verkäufer/Module/
// Zahlweise, Pause, Rechnungen, Daten löschen; dazu Garantien (früher in der Übersicht).
export default async function KundeAbrechnung({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pause?: string; zusatz?: string; retainer?: string; budget?: string; produkt?: string; zahlweise?: string; fehler?: string }>;
}) {
  const { id } = await params;
  return (
    <KundenakteSeite id={id}>
      <div className="space-y-5">
        <div data-funktion={FUNKTIONEN}>
          <KundenAbrechnung params={Promise.resolve({ id })} searchParams={searchParams} />
        </div>
        <div className="lg:max-w-[calc(50%-10px)]" data-funktion="garantien-card--garantien-stand-und-faelle">
          <GarantienCard customerId={id} />
        </div>
      </div>
    </KundenakteSeite>
  );
}
