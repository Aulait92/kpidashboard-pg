import { notFound } from "next/navigation";
import { LegalSections } from "@/components/legal-sections";
import { DruckenKnopf } from "@/components/drucken-knopf";
import { agbDesAngebots } from "@/lib/agb-angebot";
import { PROVIDER } from "@/lib/legal-texts";
import { getOfferByToken } from "@/lib/offers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihre AGB · performancegrowth", robots: { index: false, follow: false } };

// AGB des Angebots (Ole, 26.11.2026): nur die Abschnitte und Absätze, die für dieses Angebot gelten (lib/agb-angebot.ts),
// erreichbar über den Annahme-Link und im Kundenbereich unter Konto & Rechnungen → Ihr Vertrag. Angebote vor
// GUARANTEES_UNTIL zeigen die archivierte Fassung „Stand 25.11.2026“ mit Garantien, gleich gefiltert.
export default async function AngebotAgbPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await getOfferByToken(token);
  if (!offer) notFound();
  const agb = agbDesAngebots(offer);
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
          <DruckenKnopf />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Allgemeine Geschäftsbedingungen</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          für Ihr Angebot {offer.number} · {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city} · Stand {agb.stand}
        </p>
        <p className="mt-4 rounded-lg bg-[#f3f6fd] px-4 py-3 text-sm text-[#374151]" data-agb-angebot {...(agb.archiv ? { "data-agb-archiv": "" } : {})}>
          {agb.archiv
            ? `Diese Fassung gehört zu Ihrem Angebot ${offer.number} und gilt für Ihren Vertrag, einschließlich der Garantien.`
            : `Diese Fassung gehört zu Ihrem Angebot ${offer.number} und enthält die Abschnitte, die dafür gelten.`}
        </p>
        <div className="mt-10">
          <LegalSections sections={agb.abschnitte} />
        </div>
        {agb.besondere ? (
          <div className="mt-12">
            <h2 className="text-2xl font-bold tracking-tight">Besondere Bedingungen</h2>
            <p className="mb-8 mt-2 text-sm text-[#6b7280]">Bestandteil des Angebots, gehen den AGB vor.</p>
            <LegalSections sections={agb.besondere} />
          </div>
        ) : null}
      </article>
    </main>
  );
}
