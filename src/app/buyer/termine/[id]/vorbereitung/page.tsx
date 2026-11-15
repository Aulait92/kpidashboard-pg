import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, FileDown, ListChecks, MessageSquareText, Presentation, Receipt, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ButtonLink, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { abschnitte, GRUNDREGELN, leitfaden, offenePunkte, spartenVon, unterlagenFuer } from "@/lib/termin-vorbereitung";
import { angeboteAuslesenErlaubt, loadAngebote, loadVorbereitung } from "@/lib/termin-vorbereitung-server";
import { AngeboteEditor } from "./angebote-editor";
import { PreparedButton } from "./prepared-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terminvorbereitung | performancegrowth" };

const when = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

// Terminvorbereitung (Ole, 15.11.2026): Angaben in der Reihenfolge des Allianz-Rechners, offene Punkte,
// Gesprächsleitfaden und PDF im PG-Design. Aufgabe dazu auf „Heute“ bis „Vorbereitet“.
export default async function TerminVorbereitungPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const d = await loadVorbereitung(id, ctx);
  if (!d) notFound();
  const ab = abschnitte(d);
  const offen = offenePunkte(ab);
  const lf = leitfaden(d.lead.produkt);
  const unterlagen = unterlagenFuer(d.lead.produkt, spartenVon(d));
  const [ang, auslesenErlaubt] = await Promise.all([loadAngebote(id, ctx), angeboteAuslesenErlaubt(ctx.customerId)]);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {d.leadId ? (
        <Link href={`/buyer/leads/${d.leadId}`} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Zum Kontakt
        </Link>
      ) : null}
      <PageHeader title={`Termin vorbereiten: ${d.lead.name}`} subtitle={`${d.lead.produkt} · ${when(d.termin.startsAt)} Uhr · ${d.termin.mode === "video" ? "Videocall" : "Telefonat"}`} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PreparedButton id={d.id} prepared={!!d.vorbereitetAm} readOnly={ctx.preview} />
        <ButtonLink href={`/api/buyer/termine/${d.id}/vorbereitung`} external variant="secondary" size="md" icon={FileDown}>
          Als PDF
        </ButtonLink>
        <ButtonLink href={`/buyer/termine/${d.id}/praesentation`} variant="secondary" size="md" icon={Presentation}>
          Präsentation
        </ButtonLink>
        <span className="text-sm text-[color:var(--muted)]">Rechnen Sie das Angebot mit diesen Angaben vor dem Termin.</span>
      </div>

      {ang ? (
        <Card className="mb-5" data-termin-angebote>
          <CardHeader
            title="Ihre Angebote für die Präsentation"
            icon={Receipt}
            hint={ang.bestaetigt ? "Bestätigt" : ang.angebote.items.length ? "Noch nicht bestätigt" : undefined}
          />
          <AngeboteEditor
            id={d.id}
            items={ang.angebote.items}
            quelle={ang.angebote.quelle}
            bestaetigt={!!ang.bestaetigt}
            dateien={ang.dateien}
            auslesenErlaubt={auslesenErlaubt}
            readOnly={ctx.preview}
            leadHref={d.leadId ? `/buyer/leads/${d.leadId}#dokumente` : null}
          />
        </Card>
      ) : null}

      {d.zusammenfassung ? (
        <Card className="mb-5">
          <p className="px-5 py-3.5 text-sm"><span className="text-[color:var(--muted)]">Assistent: </span>{d.zusammenfassung}</p>
        </Card>
      ) : null}

      {offen.length ? (
        <Card className="mb-5 border-amber-200 bg-amber-50" data-offene-punkte>
          <CardHeader title="Im Termin klären" icon={TriangleAlert} count={offen.length} />
          <ul className="list-disc space-y-1 px-9 py-3.5 text-sm text-amber-900">
            {offen.map((o) => <li key={o}>{o}</li>)}
          </ul>
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

      <Card className="mb-5" data-leitfaden>
        <CardHeader title="Gesprächsleitfaden" icon={MessageSquareText} />
        <div className="mx-5 mt-3.5 rounded-[var(--radius-md)] bg-[color:var(--brand-soft)] px-4 py-3 text-sm" data-grundregeln>
          <div className="mb-1 font-semibold text-[color:var(--brand-dark)]">Grundregeln</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {GRUNDREGELN.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
        <ol className="space-y-3 px-5 py-3.5 text-sm">
          {lf.map((s, i) => (
            <li key={s.titel} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-xs font-bold text-white">{i + 1}</span>
              <div>
                <div className="font-semibold">
                  {s.titel}
                  {s.minuten ? <span className="ml-1.5 font-normal text-[color:var(--muted)]">ca. {s.minuten} Min.</span> : null}
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {s.punkte.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </Card>

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
