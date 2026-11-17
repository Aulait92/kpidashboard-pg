import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, FileDown, FileText, ListChecks, Presentation, Receipt, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ZurueckLink } from "@/components/zurueck-link";
import { ButtonLink, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { isNewUi } from "@/lib/new-ui";
import { abschnitte, offenePunkte, spartenVon, unterlagenFuer } from "@/lib/termin-vorbereitung";
import { angeboteAuslesenErlaubt, loadAngebote, loadVorbereitung } from "@/lib/termin-vorbereitung-server";
import { AngeboteEditor } from "./angebote-editor";
import { PreparedButton } from "./prepared-button";
import { NeueVorbereitung } from "./neu-seite";
import { neueTerminvorbereitung } from "@/lib/terminvorbereitung-neu";
import { listUnterlagen } from "@/lib/policen/server";
import { UnterlagenVomKunden } from "@/components/unterlagen-vom-kunden";
import { PolicenVergleichKurz } from "@/components/policen-vergleich-kurz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terminvorbereitung | performancegrowth" };

const when = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

// Terminvorbereitung (Ole, 15.11.2026): Angaben in der Reihenfolge des Allianz-Rechners, offene Punkte,
// PDF im PG-Design (Gesprächsleitfaden entfernt, Ole 15.11.2026). Aufgabe dazu auf „Heute“ bis „Vorbereitet“.
export default async function TerminVorbereitungPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ von?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const { von } = await searchParams;
  const d = await loadVorbereitung(id, ctx);
  if (!d) notFound();
  // Neue Terminvorbereitung mit Tarifkatalog (Ole, 15.11.2026): hinter Schalter, sonst die bisherige Seite unverändert
  if (neueTerminvorbereitung(ctx)) {
    const neu = await NeueVorbereitung({ ctx, d, von });
    if (neu) return neu;
    notFound();
  }
  const ab = abschnitte(d);
  const offen = offenePunkte(ab);
  const unterlagen = unterlagenFuer(d.lead.produkt, spartenVon(d));
  const [ang, auslesenErlaubt, newUi, unterlagenVomKunden] = await Promise.all([
    loadAngebote(id, ctx),
    angeboteAuslesenErlaubt(ctx.customerId, d.lead.produkt),
    isNewUi(ctx.customerId),
    d.leadId ? listUnterlagen(d.leadId, { preview: ctx.preview }) : [],
  ]);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {von === "heute" ? (
        <ZurueckLink href="/buyer" back>
          Heute
        </ZurueckLink>
      ) : d.leadId ? (
        <ZurueckLink href={`${newUi ? "/buyer/kontakte/" : "/buyer/leads/"}${d.leadId}`} back={von === "kontakt"}>
          Zum Kontakt
        </ZurueckLink>
      ) : null}
      <PageHeader title={`Termin vorbereiten: ${d.lead.name}`} subtitle={`${d.lead.produkt} · ${when(d.termin.startsAt)} Uhr · ${d.termin.mode === "video" ? "Videocall" : "Telefonat"}`} />
      {/* Ziel der Seite ist die Präsentation (UX, Ole 15.11.2026): Hauptknopf; „Vorbereitet“ als Haken daneben */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ButtonLink href={`/buyer/termine/${d.id}/praesentation?von=vorbereitung`} variant="primary" size="md" icon={Presentation}>
          Präsentation
        </ButtonLink>
        <ButtonLink href={`/api/buyer/termine/${d.id}/vorbereitung`} external variant="secondary" size="md" icon={FileDown}>
          Als PDF
        </ButtonLink>
        <PreparedButton id={d.id} prepared={!!d.vorbereitetAm} readOnly={ctx.preview} />
        {offen.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 ring-1 ring-inset ring-amber-200" data-offene-punkte>
            <TriangleAlert className="h-4 w-4" /> {offen.length} {offen.length === 1 ? "Angabe" : "Angaben"} im Termin klären
          </span>
        ) : null}
      </div>

      {ang ? (
        <Card id="angebote" className="mb-5" data-termin-angebote>
          <CardHeader
            title="Ihre Angebote für die Präsentation"
            icon={Receipt}
            hint={ang.bestaetigt ? "Bestätigt" : ang.angebote.items.length ? "Noch nicht bestätigt" : undefined}
          />
          <AngeboteEditor
            id={d.id}
            items={ang.angebote.items}
            quelle={ang.angebote.quelle}
            leadId={d.leadId}
            bestaetigt={!!ang.bestaetigt}
            dateien={ang.dateien}
            auslesenErlaubt={auslesenErlaubt}
            readOnly={ctx.preview}
            leadHref={d.leadId ? `${newUi ? "/buyer/kontakte/" : "/buyer/leads/"}${d.leadId}#dokumente` : null}
          />
        </Card>
      ) : null}

      {d.leadId && unterlagenVomKunden.length ? (
        <Card className="mb-5">
          <CardHeader title="Unterlagen vom Kunden" icon={FileText} />
          <div className="px-5 py-3.5 text-sm">
            <UnterlagenVomKunden leadId={d.leadId} unterlagen={unterlagenVomKunden} titel={false} />
            <div className="mt-2.5">
              <PolicenVergleichKurz terminId={d.id} leadId={d.leadId} customerId={ctx.customerId} preview={ctx.preview} />
            </div>
          </div>
        </Card>
      ) : null}

      {d.zusammenfassung ? (
        <Card className="mb-5">
          <p className="px-5 py-3.5 text-sm"><span className="text-[color:var(--muted)]">Assistent: </span>{d.zusammenfassung}</p>
        </Card>
      ) : null}

      {ab.map((s) => (
        <Card key={s.titel} className="mb-5">
          <CardHeader title={s.titel} icon={ClipboardCheck} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-3.5 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {s.felder.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-[color:var(--muted)]">{f.label}</dt>
                <dd className={f.wert ? "font-medium" : "font-medium text-amber-700"}>{f.wert ?? "offen"}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}

      {d.formular.length ? (
        <Card className="mb-5">
          <CardHeader title="Aus dem Leadformular" icon={ListChecks} />
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 px-5 py-3.5 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {d.formular.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-[color:var(--muted)]">{f.label}</dt>
                <dd className="font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}


      {unterlagen.length ? (
        <Card className="mb-5">
          <CardHeader title="Unterlagen, um die der Kunde gebeten wurde" icon={ListChecks} />
          <ul className="list-disc space-y-1 px-9 py-3.5 text-sm">
            {unterlagen.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}
