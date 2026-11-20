import Link from "next/link";
import { connection } from "next/server";
import { CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import { BEREICH_SYMBOL } from "@/components/admin-neu/rahmen/symbole";
import { PunkteGekuerzt } from "@/components/admin-neu/ui/punkte-gekuerzt";
import { Seite } from "@/components/admin-neu/ui/seite";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { berlinHour, greeting, summary } from "@/lib/admin-heute";
import { ladeHeuteSeite } from "@/lib/admin-heute-laden";
import { BEREICHE } from "@/lib/admin-neu/navigation";
import { punkteJeRolle } from "@/lib/admin-neu/rollen";
import { heuteGemerkt } from "@/lib/admin-neu/rollen-server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ImBlick } from "./im-blick";

export const metadata = { title: "Mein Tag | performancegrowth Admin" };

// Mein Tag (früher Heute) im neuen Admin: alle Aufgaben und Freigaben mit Schnellknöpfen, seit Admin v2 (Paket A2) in
// Karten je Rolle (Verkaufen, Betreuen, Liefern, Geld, Werkzeuge) statt Filter-Chips. Umbau 20.11.2026 (SUS 90+): daneben
// nur noch EINE Karte „Im Blick“ (nächste Termine, Hochrechnung als eine Zeile, Rest zugeklappt unter „Mehr“), ./im-blick.tsx.
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

export default async function HeutePage() {
  await connection();
  const session = await requireAuth();
  const { items, auto, forecast, neueBuchungen } = await ladeHeuteSeite(session.userId, new Date(), heuteGemerkt);
  const gruppen = punkteJeRolle(items);

  return (
    <Seite
      titel={greeting(berlinHour(new Date()))}
      // Alle Aufgaben (auch künftige und erledigte) eine Ebene tiefer, bewusst kein primärer Knopf: die Hauptaktion steht je Punkt
      aktionen={
        <ButtonLink href="/admin/neu/vertrieb/aufgaben" icon={ListChecks}>
          Aufgaben
        </ButtonLink>
      }
    >
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
                      {/* Die zwei dringendsten je Rolle (Umbau 20.11.2026: am Handy alle Rollen ohne langes Scrollen), Rest „Alle anzeigen“ */}
                      <PunkteGekuerzt punkte={punkte} max={2} />
                    </div>
                  );
                })
              ) : (
                // Leerer Zustand mit nächster Handlung (UX-Regel): Zeit für neue Gespräche
                <Card>
                  <EmptyState
                    icon={CheckCircle2}
                    title="Alles erledigt"
                    text="Neue Punkte erscheinen hier automatisch."
                    action={<ButtonLink href="/admin/neu/vertrieb">Pipeline öffnen</ButtonLink>}
                  />
                </Card>
              )}
            </div>
          </div>
        </section>

        <aside aria-label="Im Blick" className="min-w-0">
          <ImBlick forecast={forecast?.rows} neueBuchungen={neueBuchungen} auto={auto} />
        </aside>
      </div>
    </Seite>
  );
}
