import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ZurueckLink } from "@/components/zurueck-link";
import { ButtonLink } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { kundenlinkStand, loadPraesentation } from "@/lib/termin-vorbereitung-server";
import { publicUrlOr } from "@/lib/public-url";
import { Kundenlink } from "./kundenlink";
import { Deck } from "./deck";

export const dynamic = "force-dynamic";
export const metadata = { title: "Präsentation | performancegrowth" };

// Beratungsstrecke je Termin (Ole, 15.11.2026): Folien aus Angaben und bestätigten Angeboten (ohne Sprechzettel).
export default async function PraesentationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ von?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { id } = await params;
  const { von } = await searchParams;
  const p = await loadPraesentation(id, ctx);
  if (!p) notFound();
  const link = await kundenlinkStand(id, ctx);
  const linkStart = link
    ? { url: publicUrlOr(`/beratung/${link.token}`), bis: new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(link.bis) }
    : null;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ZurueckLink href={`/buyer/termine/${id}/vorbereitung`} back={von === "vorbereitung"}>
        Zur Terminvorbereitung
      </ZurueckLink>
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
      <Deck id={id} css={p.css} folien={p.folien} interaktiv={!ctx.preview} />
      <div className="mt-6">
        <Kundenlink id={id} start={linkStart} bereit={p.angeboteBestaetigt && !ctx.preview} />
      </div>
    </main>
  );
}
