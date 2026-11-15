import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileDown } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ButtonLink } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { loadPraesentation } from "@/lib/termin-vorbereitung-server";
import { Deck } from "./deck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Präsentation | performancegrowth" };

// Beratungsstrecke je Termin (Ole, 15.11.2026): Folien aus Angaben und bestätigten Angeboten, Sprechzettel nur für den Berater.
export default async function PraesentationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notizen?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const { notizen } = await searchParams;
  const p = await loadPraesentation(id, ctx);
  if (!p) notFound();
  if (notizen) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-4">
        <Deck id={id} css={p.css} folien={p.folien} nurNotizen />
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href={`/buyer/termine/${id}/vorbereitung`} className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Zur Terminvorbereitung
      </Link>
      <PageHeader
        title={`Präsentation: ${p.d.lead.name}`}
        subtitle={p.angeboteBestaetigt ? "Im Videocall den Bildschirm teilen und auf Vollbild gehen." : "Noch ohne Angebote: Bestätigen Sie Ihre Angebote in der Terminvorbereitung, dann erscheinen sie hier."}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ButtonLink href={`/api/buyer/termine/${id}/praesentation`} external variant="secondary" size="md" icon={FileDown}>
          Als PDF
        </ButtonLink>
        {!p.marke.logoUrl && ctx.teamRole !== "advisor" ? (
          <Link href="/buyer/einstellungen/branding" className="text-sm font-medium text-[color:var(--brand)] hover:underline" data-logo-hinweis>
            Eigenes Logo auf die Folien bringen
          </Link>
        ) : null}
      </div>
      <Deck id={id} css={p.css} folien={p.folien} />
    </main>
  );
}
