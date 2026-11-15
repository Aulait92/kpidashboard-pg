import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { loadKundenPraesentation } from "@/lib/termin-vorbereitung-server";
import { FolienListe } from "./folien-liste";

// Kundenlink zur Beratung (Ole, 15.11.2026): der Stand aus dem Termin zum Nachlesen, ohne Schalter und Sprechzettel.
// Geheimer Link je Termin, läuft nach 14 Tagen ab.
export const dynamic = "force-dynamic";
export const metadata = { title: "Ihre Beratung", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(d);

export default async function BeratungPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await loadKundenPraesentation(token);
  if (!p) notFound();
  return (
    <>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6" data-kundenlink>
        <h1 className="text-xl font-bold [text-wrap:balance]">Ihre Beratung, {p.name}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Mit {p.berater}, {p.marke.name}. Dieser Link ist bis zum {datum(p.bis)} erreichbar.
        </p>
        <a
          href={`/beratung/${token}/pdf`}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] underline"
        >
          <FileDown className="h-4 w-4" /> Als PDF speichern
        </a>
        <div className="mt-4">
          <FolienListe css={p.css} folien={p.folien} />
        </div>
      </main>
      <LeadLegalFooter customerId={p.customerId} />
    </>
  );
}
