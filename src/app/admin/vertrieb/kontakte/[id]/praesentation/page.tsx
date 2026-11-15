import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { FolienDeck } from "@/components/folien-deck";
import { ButtonLink } from "@/components/ui";
import { getAppUrl } from "@/lib/email";
import { shortName } from "@/lib/vertrieb/crm";
import { listPresentations } from "@/lib/vertrieb/praesentationen";
import { folienListe, isVerkaufsAudience, VERKAUFS_AUDIENCES } from "@/lib/vertrieb/verkaufspraesentation";
import { aktiverVerkaufsLink, ladeVerkaufsPraesentation, verkaufsAufrufe } from "@/lib/vertrieb/verkaufspraesentation-server";
import { VerkaufsLinkKarte } from "./link-karte";

export const metadata = { title: "Präsentation | Vertrieb" };

const LABEL = { vertreter: "Vertreter", makler: "Makler" } as const;
const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);
const zeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

// Vertriebspräsentation im Gespräch (Ole, 15.11.2026): Oles Folien als Web-Präsentation, Preise aus dem Angebot des Kontakts,
// Folie 17 mit der Live-Demo. Vollbild, Pfeiltasten, PDF (Unterlagen der Zielgruppe). Keine Sprechzettel.
export default async function VerkaufsPraesentationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fassung?: string }> }) {
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
  const back = `/admin/vertrieb/kontakte/${p.contact.id}`;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4" data-verkaufspraesentation>
      <div>
        <Link href={back} className="text-sm text-slate-500 hover:underline">
          ← {shortName(p.contact.name)}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Präsentation: {shortName(p.contact.name)}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {p.angebotNr ? `Paket und Rechnung mit den Preisen aus Angebot ${p.angebotNr}.` : "Noch kein Angebot: Paket und Rechnung mit Listenpreisen."} Pfeiltasten zum Blättern,
          Vollbild zum Teilen im Call. Folie 17 zeigt die Live-Demo zum Anklicken.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" data-fassung>
        <span className="text-[color:var(--muted)]">Fassung:</span>
        {VERKAUFS_AUDIENCES.map((a) => (
          <Link
            key={a}
            href={`?fassung=${a}`}
            aria-current={a === p.audience ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${a === p.audience ? "border-[color:var(--brand)] bg-[color:var(--brand)] text-white" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            {LABEL[a]} ({folienListe(a).length} Folien)
          </Link>
        ))}
      </div>
      <FolienDeck
        css={p.css}
        folien={p.folien}
        extra={
          pdf ? (
            <ButtonLink href={`/api/admin/praesentationen/${p.audience}/pdf`} external variant="secondary" size="md" icon={FileDown}>
              PDF ({LABEL[p.audience]})
            </ButtonLink>
          ) : (
            <Link href="/admin/marketing/unterlagen" className="text-xs text-[color:var(--brand)] underline">
              PDF unter Unterlagen hochladen
            </Link>
          )
        }
      />
      <div className="max-w-2xl">
        <VerkaufsLinkKarte
          contactId={p.contact.id}
          audience={p.audience}
          start={link && appUrl ? { url: `${appUrl}/praesentation/${link.token}`, bis: tag(link.bis) } : null}
          aufrufe={aufrufe.map(zeit)}
        />
      </div>
    </div>
  );
}
