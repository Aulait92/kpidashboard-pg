import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { FolienDeck } from "@/components/folien-deck";
import { ButtonLink } from "@/components/ui";
import { requireAuth } from "@/lib/vertrieb/auth";
import { listPresentations } from "@/lib/vertrieb/praesentationen";
import { folienListe, isVerkaufsAudience, paketDaten, verkaufsCss, verkaufsFolien, VERKAUFS_AUDIENCES } from "@/lib/vertrieb/verkaufspraesentation";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Web-Präsentation | Unterlagen" };
export const dynamic = "force-dynamic";

const LABEL = { vertreter: "Vertreter", makler: "Makler" } as const;

// Vertriebspräsentation ohne Kontakt (Ole, 15.11.2026): Listenpreise, z. B. für Gespräche ohne Angebot oder zum Durchsehen.
// Mit Kontakt (Preise aus dem Angebot, Link für den Interessenten): Vertrieb → Kontakt → „Präsentation“.
export default async function UnterlagenPraesentationPage({ params }: { params: Promise<{ audience: string }> }) {
  await requireAuth();
  const { audience } = await params;
  if (!isVerkaufsAudience(audience)) notFound();
  const pdf = (await listPresentations()).some((d) => d.audience === audience && d.format === "pdf");
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4" data-verkaufspraesentation>
      <div>
        <AdminBack href="/admin/marketing/unterlagen">Unterlagen</AdminBack>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Web-Präsentation {LABEL[audience]}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Mit Listenpreisen. Für Preise aus einem Angebot und den Link für den Interessenten: Vertrieb, Kontakt, „Präsentation“. Pfeiltasten zum Blättern,
          Vollbild zum Teilen im Call.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {VERKAUFS_AUDIENCES.map((a) => (
          <Link
            key={a}
            href={`/admin/marketing/unterlagen/praesentation/${a}`}
            aria-current={a === audience ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${a === audience ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            {LABEL[a]} ({folienListe(a).length} Folien)
          </Link>
        ))}
      </div>
      <FolienDeck
        css={verkaufsCss()}
        folien={verkaufsFolien(audience, paketDaten(null, audience))}
        extra={
          pdf ? (
            <ButtonLink href={`/api/admin/praesentationen/${audience}/pdf`} external variant="secondary" size="md" icon={FileDown}>
              PDF ({LABEL[audience]})
            </ButtonLink>
          ) : null
        }
      />
    </div>
  );
}
