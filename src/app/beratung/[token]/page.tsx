import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { loadKundenPraesentation } from "@/lib/termin-vorbereitung-server";
import { prisma } from "@/lib/prisma";
import { a, asAnsprache } from "@/lib/ansprache";
import { FolienListe } from "./folien-liste";

// Kundenlink zur Beratung (Ole, 15.11.2026): der Stand aus dem Termin zum Nachlesen, ohne Schalter und Sprechzettel.
// Geheimer Link je Termin, läuft nach 14 Tagen ab.
export const dynamic = "force-dynamic";
export const metadata = { title: "Ihre Beratung", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long", year: "numeric" }).format(d);

export default async function BeratungPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await loadKundenPraesentation(token);
  if (!p) {
    // Abgelaufen, aber bekannt (16.11.2026): sagen, wer weiterhilft, statt nur „nicht mehr gültig“
    const alt = /^[A-Za-z0-9_-]{20,64}$/.test(token)
      ? await prisma.appointment.findUnique({ where: { shareToken: token }, select: { customerId: true, customer: { select: { name: true, leadAddress: true } } } })
      : null;
    if (!alt) notFound();
    const an = asAnsprache(alt.customer.leadAddress);
    return (
      <>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center" data-kundenlink-abgelaufen>
          <h1 className="text-xl font-semibold tracking-tight">Dieser Link ist nicht mehr gültig</h1>
          <p className="mt-2 text-[15px] text-[color:var(--muted)]">
            {a(
              an,
              `Deine Beratungsunterlagen sind aus Datenschutzgründen nur 14 Tage online. ${alt.customer.name} schickt dir gern einen neuen Link.`,
              `Ihre Beratungsunterlagen sind aus Datenschutzgründen nur 14 Tage online. ${alt.customer.name} schickt Ihnen gern einen neuen Link.`,
            )}
          </p>
        </main>
        <LeadLegalFooter customerId={alt.customerId} />
      </>
    );
  }
  return (
    <>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6" data-kundenlink>
        <h1 className="text-xl font-bold [text-wrap:balance]">Ihre Beratung, {p.name}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {p.marke.name.toLowerCase().includes(p.berater.toLowerCase()) ? p.marke.name : `Mit ${p.berater}, ${p.marke.name}`}. Dieser Link ist bis zum {datum(p.bis)} erreichbar.
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
