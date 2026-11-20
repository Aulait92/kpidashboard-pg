import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FileDown } from "lucide-react";
import { FolienDeck } from "@/components/folien-deck";
import { ButtonLink } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { requireAuth } from "@/lib/vertrieb/auth";
import { listPresentations } from "@/lib/vertrieb/praesentationen";
import { folienListe, isVerkaufsAudience, paketDaten, verkaufsCss, verkaufsFolien, VERKAUFS_AUDIENCES, VERKAUFS_LABEL } from "@/lib/vertrieb/verkaufspraesentation";
import { cn } from "@/lib/utils";

export const metadata = { title: "Präsentation | performancegrowth Admin" };

const LABEL = VERKAUFS_LABEL;

// Marketing → Unterlagen → Web-Präsentation mit Listenpreisen (wie /admin/marketing/unterlagen/praesentation/[audience]).
// Mit Angebotspreisen und Link für den Interessenten: Vertrieb → Kontakt → „Präsentation“.
export default async function Page({ params }: { params: Promise<{ audience: string }> }) {
  await connection();
  await requireAuth();
  const { audience } = await params;
  if (!isVerkaufsAudience(audience)) notFound();
  const pdf = (await listPresentations()).some((d) => d.audience === audience && d.format === "pdf");
  return (
    <Seite
      titel={`Web-Präsentation ${LABEL[audience]}`}
      untertitel="Mit Listenpreisen. Pfeiltasten zum Blättern, Vollbild zum Teilen im Call."
      zurueck={{ href: "/admin/neu/marketing/unterlagen", label: "Unterlagen" }}
      breit
    >
      <div className="space-y-4" data-verkaufspraesentation data-funktion="page--web-praesentation-je-zielgruppe-oeffnen-und-als">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {VERKAUFS_AUDIENCES.map((a) => (
            <Link
              key={a}
              href={`/admin/neu/marketing/unterlagen/praesentation/${a}`}
              aria-current={a === audience ? "page" : undefined}
              className={cn("inline-flex min-h-10 items-center rounded-full border px-3", a === audience ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white" : "border-[color:var(--border)] bg-white")}
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
    </Seite>
  );
}
