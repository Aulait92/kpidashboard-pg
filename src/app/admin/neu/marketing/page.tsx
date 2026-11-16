import { connection } from "next/server";
import { Card, CardHeader } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { GenerateButton } from "@/app/admin/marketing/linkedin/forms";
import {
  LinkedInEinrichten,
  LinkedInEinstellungen,
  LinkedInEntwuerfe,
  LinkedInErgebnisse,
  LinkedInFotos,
  LinkedInGeplant,
  LinkedInHinweise,
  LinkedInKennzahlen,
  LinkedInStatistik,
  LinkedInVerbindung,
  ladeLinkedIn,
  linkedInRhythmus,
} from "@/components/admin/linkedin-bausteine";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Marketing | performancegrowth Admin" };

// Marketing → LinkedIn (früher /admin/marketing/linkedin): Hauptaufgabe Entwürfe freigeben (links), daneben die
// Reichweite bei der Zielgruppe. Geplant, Ergebnisse je Post, Statistik, Fotos, Einstellungen und Verbindung eingeklappt.
// Laden, Bausteine und Server Actions gemeinsam mit der alten Seite (components/admin/linkedin-bausteine.tsx,
// app/admin/marketing/linkedin/forms.tsx). Die Rückkehr von der LinkedIn-Anmeldung landet weiter auf der alten Seite.
export default async function Page({ searchParams }: { searchParams: Promise<{ li?: string }> }) {
  await connection();
  await requireAuth();
  const { li } = await searchParams;
  const d = await ladeLinkedIn();
  const { settings } = d;

  return (
    <Seite titel="Marketing" reiter="marketing">
      <div className="space-y-4">
        <LinkedInHinweise d={d} li={li} />
        <LinkedInEinrichten d={d} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-3" aria-label="Entwürfe zur Freigabe">
            <Card menus>
              <CardHeader title="Entwürfe zur Freigabe" count={d.drafts.length} />
              <div className="space-y-2 px-5 py-4" data-funktion="actions-generatenowaction--entwuerfe-jetzt-generieren-fuer-x-tage">
                <p className="text-sm text-[color:var(--muted)]">{linkedInRhythmus(d)}</p>
                <GenerateButton disabled={!settings.about.trim()} defaultDays={settings.planDays > 1 ? Math.min(14, settings.planDays) : 1} />
              </div>
            </Card>
            <div
              className="space-y-3"
              data-funktion="actions-savedraftaction--entwuerfe-zur-freigabe-text-bearbeiten-bild actions-approveaction--entwurf-freigeben-planen actions-approveaction-sofort--sofort-veroeffentlichen actions-discardaction--entwurf-verwerfen"
            >
              <LinkedInEntwuerfe d={d} />
            </div>
          </section>

          <section className="min-w-0 space-y-3" aria-label="Reichweite je Zielgruppe">
            <h2 className="text-[15px] font-semibold">Reichweite bei der Zielgruppe</h2>
            <LinkedInKennzahlen d={d} spalten="grid-cols-2" />
          </section>
        </div>

        {d.planned.length ? (
          <Aufklapp titel="Geplant" hinweis={String(d.planned.length)} funktion="actions-unapproveaction--geplante-posts-und-freigabe-zuruecknehmen">
            <LinkedInGeplant d={d} />
          </Aufklapp>
        ) : null}
        <Aufklapp
          titel="Ergebnisse je Post"
          hinweis={`${d.results.length} Posts`}
          funktion="page-ergebnisse--ergebnisse-je-post-impressionen-zielgruppe actions-setmetricsaction--zahlen-je-post-nachtragen-importierten-text"
        >
          <p className="mb-2 text-sm text-[color:var(--muted)]">Zielgruppen-Reichweite = Impressionen × Anteil Vermittler unter den Zuschauern. Vergleich mit dem Median der 30 Posts davor.</p>
          <LinkedInErgebnisse d={d} />
        </Aufklapp>
        <Aufklapp titel="Statistik hochladen" hinweis="LinkedIn-Export" funktion="actions-importaction--linkedin-statistik-excel-hochladen">
          <Card className="space-y-3 p-4 sm:p-5">
            <LinkedInStatistik d={d} />
          </Card>
        </Aufklapp>
        <Aufklapp titel="Fotos" hinweis={String(d.photos.length)} funktion="actions-uploadphotosaction--fotos-hochladen-beschreiben-loeschen">
          <Card className="space-y-3 p-4 sm:p-5">
            <LinkedInFotos d={d} />
          </Card>
        </Aufklapp>
        <Aufklapp titel="Einstellungen" hinweis="Zielgruppe, Über mich, Uhrzeiten" offen={!settings.about.trim()} funktion="actions-savesettingsaction--einstellungen-zielgruppe-produkte-ueber-mich">
          <Card className="p-4 sm:p-5">
            <LinkedInEinstellungen d={d} />
          </Card>
        </Aufklapp>
        <Aufklapp titel="Verbindung" hinweis={d.connected ? "verbunden" : "nicht verbunden"}>
          <LinkedInVerbindung d={d} titel={false} />
        </Aufklapp>
      </div>
    </Seite>
  );
}
