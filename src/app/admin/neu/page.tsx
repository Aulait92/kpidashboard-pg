import { connection } from "next/server";
import { HeuteAllesErledigt, HeuteFilterChips, HochrechnungKarte, LaeuftVonAllein, NeueBuchungenHinweis } from "@/components/admin/heute-bausteine";
import { HeuteList } from "@/components/admin/heute-list";
import { VertriebBlick } from "@/components/admin/vertrieb-blick";
import { Seite } from "@/components/admin-neu/ui/seite";
import { HEUTE_FILTERS, berlinHour, greeting, summary } from "@/lib/admin-heute";
import { ladeHeuteSeite } from "@/lib/admin-heute-laden";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Heute | performancegrowth Admin" };

// Heute im neuen Admin: alle Aufgaben und Freigaben aus allen Bereichen mit Schnellknöpfen, daneben Vertrieb
// (Termine, Anfragen, Pipeline), neue Buchungen, Hochrechnung und „Läuft von allein“.
// Dieselben Bausteine, Daten und Server Actions wie /admin/heute (components/admin/heute-*, app/admin/heute/actions.ts).
// Die Aufgabenliste (früher Reiter „Aufgaben“) liegt unter Vertrieb → Aufgaben.
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

export default async function HeutePage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  await connection();
  const session = await requireAuth();
  const { bereich = "" } = await searchParams;
  const { items, auto, forecast, neueBuchungen } = await ladeHeuteSeite(session.userId);
  const filter = HEUTE_FILTERS.find((f) => f.key === bereich) ?? HEUTE_FILTERS[0];
  const shown = items.filter(filter.match);

  return (
    <Seite titel={greeting(berlinHour(new Date()))}>
      <p className="-mt-3 mb-4 text-sm text-[color:var(--muted)]" data-funktion="layout--begruessung-und-zusammenfassung-der-offenen">
        {summary(items)}
      </p>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section aria-label="Braucht Sie" className="min-w-0">
          <div data-funktion="admin-heute-heute-filters--filter-alle-vertrieb-kunden-chats-freigaben">
            <HeuteFilterChips items={items} aktiv={filter.key} basis="/admin/neu" />
          </div>
          <div data-funktion={LISTE}>{shown.length ? <HeuteList items={shown} /> : <HeuteAllesErledigt gefiltert={items.length > 0} />}</div>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          <div data-funktion={VERTRIEB}>
            <VertriebBlick highlight={bereich === "vertrieb"} />
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
