import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight } from "lucide-react";
import { HeuteAllesErledigt, HochrechnungKarte, LaeuftVonAllein, NeueBuchungenHinweis } from "@/components/admin/heute-bausteine";
import { VertriebBlick } from "@/components/admin/vertrieb-blick";
import { BEREICH_SYMBOL } from "@/components/admin-neu/rahmen/symbole";
import { PunkteGekuerzt } from "@/components/admin-neu/ui/punkte-gekuerzt";
import { Seite } from "@/components/admin-neu/ui/seite";
import { berlinHour, greeting, summary } from "@/lib/admin-heute";
import { ladeHeuteSeite } from "@/lib/admin-heute-laden";
import { BEREICHE } from "@/lib/admin-neu/navigation";
import { punkteJeRolle } from "@/lib/admin-neu/rollen";
import { heuteGemerkt } from "@/lib/admin-neu/rollen-server";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Mein Tag | performancegrowth Admin" };

// Mein Tag (früher Heute) im neuen Admin: alle Aufgaben und Freigaben mit Schnellknöpfen, seit Admin v2 (Paket A2) in
// Karten je Rolle (Verkaufen, Betreuen, Liefern, Geld, Werkzeuge) statt Filter-Chips; daneben Vertrieb (Termine,
// Anfragen, Pipeline), neue Buchungen, Hochrechnung und „Läuft von allein“.
// Dieselben Bausteine, Daten und Server Actions wie /admin/heute (components/admin/heute-*, app/admin/heute/actions.ts).
// Die Aufgabenliste (früher Reiter „Aufgaben“) liegt unter Mein Tag → Aufgaben (/admin/neu/vertrieb/aufgaben).
const LISTE = [
  "heute-list--liste-braucht-sie-aus-allen-bereichen-mit",
  // Schnellknöpfe in den Zeilen (components/admin/heute-list.tsx)
  "actions-completetaskaction--aufgabe-erledigt-schnellknopf",
  "actions-postponetaskaction--aufgabe-verschieben-auf-morgen-schnellknopf",
  "actions-meetingoutcomeaction--termin-ergebnis-eintragen-stattgefunden-nicht",
  "actions-decidestornoquickaction--reklamation-ppl-storno-direkt-annehmen-oder",
  "actions-garantiegewaehrenaction--garantie-fall-gewaehren",
  "actions-garantieablehnenaction--garantie-fall-ablehnen-mit-begruendung",
  "actions-offerfollowedupaction--angebot-als-nachgefasst-markieren",
  "actions-dismissaction--punkt-ausblenden-fuer-x-tage-spaeter-gelesen",
  "actions-undoheuteaction--ausblenden-rueckgaengig-machen-toast",
  "task-row-actions--aus-aufgabe-anrufen-oder-kontakt-oeffnen",
  // Punkte aus allen Bereichen (lib/admin-heute.ts)
  "admin-heute-forms--punkte-formulare-ohne-zuordnung-geparkte-leads",
  "admin-heute-pay--punkte-zahlung-offen-lastschrift-fehlgeschlagen",
  "admin-heute-ob--punkte-onboarding-wartet-einrichtung-haengt",
  "admin-heute-modul--punkte-bestandskunden-modul-gewuenscht-hilfe",
  "admin-heute-linkedin--punkte-linkedin-entwuerfe-post-fehlgeschlagen",
  "admin-heute-chats--punkte-support-chats-monatsberichte-pruefen",
  "admin-heute-rechnung--punkt-rechnungen-ohne-steuernummer",
  "admin-heute-heartbeatproblem--punkt-hintergrund-jobs-bzw-werbedaten-abgleich",
  "admin-heute-meet--termine-heute-und-aufgaben-heute-als-zeilen",
].join(" ");

const VERTRIEB = [
  "vertrieb-blick--vertrieb-auf-einen-blick-heute-faellig",
  "vertrieb-blick--vertrieb-auf-einen-blick-naechste-termine",
  "vertrieb-blick--vertrieb-auf-einen-blick-neue-anfragen-der",
  "vertrieb-blick--vertrieb-auf-einen-blick-kontakte-je-stufe",
].join(" ");

export default async function HeutePage() {
  await connection();
  const session = await requireAuth();
  const { items, auto, forecast, neueBuchungen } = await ladeHeuteSeite(session.userId, new Date(), heuteGemerkt);
  const gruppen = punkteJeRolle(items);

  return (
    <Seite titel={greeting(berlinHour(new Date()))}>
      <p className="-mt-3 mb-4 text-sm text-[color:var(--muted)]" data-funktion="layout--begruessung-und-zusammenfassung-der-offenen">
        {summary(items)}
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section aria-label="Braucht Sie" className="min-w-0">
          {/* Karten je Rolle ersetzen den Filter Alle/Vertrieb/Kunden/Chats/Freigaben (Zuordnung F018, F019) */}
          <div className="space-y-6" data-funktion="admin-heute-heute-filters--filter-alle-vertrieb-kunden-chats-freigaben">
            <div className="space-y-6" data-funktion={LISTE}>
              {gruppen.length ? (
                gruppen.map(({ rolle, punkte }) => {
                  const b = BEREICHE.find((x) => x.id === rolle)!;
                  const Icon = BEREICH_SYMBOL[rolle];
                  return (
                    <div key={rolle} data-rolle={rolle}>
                      <div className="mb-2 flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <h2 className="text-base font-semibold">{b.label}</h2>
                        <span className="rounded-full bg-[color:var(--brand-soft)] px-2 text-xs font-semibold leading-5 text-[color:var(--brand-dark)]">{punkte.length}</span>
                        <Link href={b.pfad} aria-label={`${b.label} öffnen`} className="ml-auto inline-flex min-h-10 items-center gap-0.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
                          Öffnen
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </div>
                      <PunkteGekuerzt punkte={punkte} />
                    </div>
                  );
                })
              ) : (
                <HeuteAllesErledigt gefiltert={false} />
              )}
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <div data-funktion={VERTRIEB}>
            <VertriebBlick highlight={false} />
          </div>
          <div className="contents" data-funktion="admin-buchungen-neu-countneuebuchungen--hinweis-neue-buchungen-seit-letztem-besuch">
            <NeueBuchungenHinweis anzahl={neueBuchungen} />
          </div>
          <div className="contents" data-funktion="forecast-computemonthlyforecast--umsatz-bzw-gewinn-bis-heute-mit-monats">
            <HochrechnungKarte rows={forecast?.rows} titel={null} />
          </div>
          <div data-funktion="admin-heute-autorow--laeuft-von-allein-was-die-app-in-7-tagen">
            <LaeuftVonAllein auto={auto} zugeklappt />
          </div>
        </div>
      </div>
    </Seite>
  );
}
