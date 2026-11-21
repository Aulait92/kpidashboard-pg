import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { FolienDeck } from "@/components/folien-deck";
import { ButtonLink } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { VerkaufsLinkKarte } from "@/app/admin/vertrieb/kontakte/[id]/praesentation/link-karte";
import { getAppUrl } from "@/lib/email";
import { shortName } from "@/lib/vertrieb/crm";
import { listPresentations } from "@/lib/vertrieb/praesentationen";
import { folienListe, isVerkaufsAudience, VERKAUFS_AUDIENCES, VERKAUFS_LABEL } from "@/lib/vertrieb/verkaufspraesentation";
import { aktiverVerkaufsLink, ladeVerkaufsPraesentation, verkaufsAufrufe } from "@/lib/vertrieb/verkaufspraesentation-server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Präsentation | performancegrowth Admin" };

const LABEL = VERKAUFS_LABEL;
const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);
const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

// Vertriebspräsentation im Gespräch: wie /admin/vertrieb/kontakte/[id]/praesentation (gleiche Folien, Preise aus dem
// Angebot, Vollbild, PDF, Link für den Interessenten mit Aufrufen). Fassung Vertreter oder Makler umschaltbar.
export default async function PraesentationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fassung?: string }> }) {
  await requireAuth();
  const { id } = await params;
  const { fassung } = await searchParams;
  const p = await ladeVerkaufsPraesentation(id, isVerkaufsAudience(fassung) ? fassung : null);
  if (!p) notFound();
  const [dateien, link, aufrufe] = await Promise.all([listPresentations(), aktiverVerkaufsLink(id), verkaufsAufrufe(id)]);
  const pdf = dateien.some((d) => d.audience === p.audience && d.format === "pdf");
  let appUrl = "";
  try {
    appUrl = getAppUrl();
  } catch {
    appUrl = "";
  }
  const name = shortName(p.contact.name);
  return (
    <Seite
      titel="Präsentation"
      untertitel={p.angebotNr ? `Preise aus Angebot ${p.angebotNr}. Pfeiltasten zum Blättern.` : "Noch kein Angebot: Listenpreise. Pfeiltasten zum Blättern."}
      zurueck={{ href: kontaktPfad(p.contact.id), label: name }}
      breit
    >
      <div className="space-y-4" data-verkaufspraesentation>
        <div className="flex flex-wrap items-center gap-1.5" data-fassung data-funktion="page-fassung--fassung-vertreter-oder-makler-waehlen">
          {VERKAUFS_AUDIENCES.map((a) => (
            <Link
              key={a}
              href={`?fassung=${a}`}
              aria-current={a === p.audience ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-medium sm:min-h-8",
                a === p.audience
                  ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white"
                  : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
              )}
            >
              {LABEL[a]} <span className="ml-1 opacity-80">{folienListe(a).length} Folien</span>
            </Link>
          ))}
        </div>
        <div data-funktion="folien-deck--verkaufspraesentation-mit-angebotspreisen">
          <FolienDeck
            css={p.css}
            folien={p.folien}
            extra={
              pdf ? (
                <ButtonLink href={`/api/admin/praesentationen/${p.audience}/pdf`} external variant="secondary" size="md" icon={FileDown}>
                  PDF ({LABEL[p.audience]})
                </ButtonLink>
              ) : (
                <Link href="/admin/neu/marketing/unterlagen" className="text-xs text-[color:var(--brand)] underline">
                  PDF unter Unterlagen hochladen
                </Link>
              )
            }
          />
        </div>
        <div className="max-w-2xl" data-funktion="actions-verkaufslinkaction--link-fuer-interessenten-erzeugen-kopieren actions-verkaufslinkbeendenaction--praesentationslink-beenden">
          <VerkaufsLinkKarte
            contactId={p.contact.id}
            audience={p.audience}
            start={link && appUrl ? { url: `${appUrl}/praesentation/${link.token}`, bis: tag(link.bis) } : null}
            aufrufe={aufrufe.map(zeit)}
          />
        </div>
      </div>
    </Seite>
  );
}
