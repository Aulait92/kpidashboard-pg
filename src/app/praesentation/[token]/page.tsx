import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { FolienDeck } from "@/components/folien-deck";
import { getCurrentSession } from "@/lib/auth";
import { listPresentations } from "@/lib/vertrieb/praesentationen";
import { AUFRUF_HINWEIS, DATENSCHUTZ_URL, ladeVerkaufsLink, verkaufsAufrufMerken } from "@/lib/vertrieb/verkaufspraesentation-server";

// Vertriebspräsentation zum Nachklicken für den Interessenten (Ole, 15.11.2026): geheimer Link je Kontakt, 14 Tage,
// ohne Sprechzettel; Preise aus seinem Angebot. Nur auf der App-Adresse (nicht auf der Buchungsadresse der Vermittler).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ihre Präsentation | performancegrowth", robots: { index: false, follow: false }, referrer: "no-referrer" };

const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(d);

export default async function VerkaufsLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await ladeVerkaufsLink(token);
  if (!p) notFound();
  // Aufruf merken, außer wir schauen selbst (Admin angemeldet)
  const s = await getCurrentSession().catch(() => null);
  if (s?.role !== "ADMIN") await verkaufsAufrufMerken(p.linkId);
  const pdf = await listPresentations().then((l) => l.some((f) => f.audience === p.audience && f.format === "pdf"), () => false);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6" data-verkaufslink-seite>
      <h1 className="text-xl font-bold [text-wrap:balance] sm:text-2xl">Leads + Software von performancegrowth</h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        Die Präsentation aus unserem Gespräch{p.preise.name ? ` für ${p.preise.name}` : ""}
        {p.angebotNr ? `, mit den Preisen aus Ihrem Angebot ${p.angebotNr}` : ""}. Blättern mit den Pfeiltasten oder per Wischen. Dieser Link ist bis zum{" "}
        {datum(p.bis)} erreichbar.
      </p>
      <div className="mt-4">
        <FolienDeck
          css={p.css}
          folien={p.folien}
          extra={
            pdf ? (
              <a href={`/praesentation/${token}/pdf`} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] underline">
                <FileDown className="h-4 w-4" /> Als PDF speichern
              </a>
            ) : null
          }
        />
      </div>
      <p className="mt-3 text-sm text-[color:var(--muted)] sm:hidden">Tipp: Handy quer halten, dann wird die Folie größer.</p>
      {/* Aufrufstatistik (SalesPresentationView): Hinweis nach Art. 13 DSGVO, Rechtsvorprüfung 16.11.2026 */}
      <p className="mt-6 text-xs text-[color:var(--muted)]" data-aufruf-hinweis>
        {AUFRUF_HINWEIS}{" "}
        <a href={DATENSCHUTZ_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-[color:var(--brand)]">
          Datenschutzerklärung
        </a>
        .
      </p>
    </main>
  );
}
