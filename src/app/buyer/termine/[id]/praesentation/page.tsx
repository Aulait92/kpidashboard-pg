import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { ZurueckLink } from "@/components/zurueck-link";
import { ButtonLink } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { kundenlinkStand, loadPraesentation } from "@/lib/termin-vorbereitung-server";
import { publicUrlOr } from "@/lib/public-url";
import { ungepruefteSparten } from "@/lib/tarifauswahl-server";
import { Kundenlink } from "./kundenlink";
import { Deck } from "./deck";
import { DemoAnsicht } from "@/app/demo/beratung/demo-ansicht";

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
  const [link, ungeprueft] = await Promise.all([kundenlinkStand(id, ctx), ungepruefteSparten(id, ctx)]);
  const linkStart = link
    ? { url: publicUrlOr(`/beratung/${link.token}`), bis: new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(link.bis) }
    : null;
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      {von === "heute" ? (
        <ZurueckLink href="/buyer" back>
          Heute
        </ZurueckLink>
      ) : (
        <ZurueckLink href={`/buyer/termine/${id}/vorbereitung`} back={von === "vorbereitung"}>
          Zur Terminvorbereitung
        </ZurueckLink>
      )}
      <PageHeader
        title={`Präsentation: ${p.d.lead.name}`}
        subtitle={p.angeboteBestaetigt || ctx.demo ? "Im Videocall den Bildschirm teilen und auf Vollbild gehen." : "Noch ohne Angebote: Bestätigen Sie Ihre Angebote in der Terminvorbereitung, dann erscheinen sie hier."}
      />
      {/* Pilot „Beiträge rechnen“: Richtwerte nie unbemerkt beim Kunden (docs/preise-pilot.md) */}
      {ungeprueft.length && !ctx.demo ? (
        <p className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-beitraege-ungeprueft>
          Beiträge noch nicht bestätigt ({ungeprueft.join(", ")}).{" "}
          <Link href={`/buyer/termine/${id}/vorbereitung#angebote`} className="-my-2.5 inline-block py-2.5 font-semibold underline">
            Jetzt prüfen
          </Link>
        </p>
      ) : null}
      {ctx.demo ? (
        // Öffentliche App-Demo: dieselbe Präsentation mit festen Beispieltarifen, rechnet nur im Browser (lib/demo-beratung.ts)
        <DemoAnsicht />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ButtonLink href={`/api/buyer/termine/${id}/praesentation`} external variant="secondary" size="md" icon={FileDown}>
              Als PDF
            </ButtonLink>
          </div>
          <Deck id={id} css={p.css} folien={p.folien} interaktiv={!ctx.preview} />
        </>
      )}
      {/* Selten: Logo-Hinweis unter den Folien statt neben dem Knopf (16.11.2026) */}
      {!p.marke.logoUrl && ctx.teamRole !== "advisor" && !ctx.demo ? (
        <p className="mt-3 text-sm text-[color:var(--muted)]" data-logo-hinweis>
          Noch ohne Ihr Logo.{" "}
          <Link href="/buyer/einstellungen/branding" className="-my-2.5 inline-block py-2.5 font-medium text-[color:var(--brand)] hover:underline">
            Logo hinzufügen
          </Link>
        </p>
      ) : null}
      {ctx.demo ? null : (
        <div className="mt-6">
          <Kundenlink id={id} start={linkStart} bereit={p.angeboteBestaetigt && !ctx.preview} />
        </div>
      )}
    </main>
  );
}
