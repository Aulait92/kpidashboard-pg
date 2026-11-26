import { notFound, redirect } from "next/navigation";
import { LegalSections } from "@/components/legal-sections";
import { DruckenKnopf } from "@/components/drucken-knopf";
import { AGB_2026_11_25, AGB_ARCHIV_STAND, agbMitGarantien } from "@/lib/agb-2026-11-25";
import { PROVIDER } from "@/lib/legal-texts";
import { getOfferByToken } from "@/lib/offers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ihre AGB · performancegrowth", robots: { index: false, follow: false } };

// Archivierte AGB „Stand 25.11.2026“ mit Abschnitt „Garantien“ (Ole, 26.11.2026): nur für Angebote vor
// GUARANTEES_UNTIL, erreichbar über den Angebotslink (Annahme) und im Kundenbereich unter Konto & Rechnungen → Ihr
// Vertrag. Neuere Angebote landen auf den aktuellen AGB ohne Garantien.
export default async function AngebotAgbPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const offer = await getOfferByToken(token);
  if (!offer) notFound();
  if (!agbMitGarantien(offer)) redirect("/rechtliches/agb");
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
          <DruckenKnopf />
        </div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Allgemeine Geschäftsbedingungen</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          für Leadgenerierung und Software · {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city} · Stand {AGB_ARCHIV_STAND}
        </p>
        <p className="mt-4 rounded-lg bg-[#f3f6fd] px-4 py-3 text-sm text-[#374151]" data-agb-archiv>
          Diese Fassung gehört zu Ihrem Angebot {offer.number} und gilt für Ihren Vertrag, einschließlich der Garantien.
        </p>
        <div className="mt-10">
          <LegalSections sections={AGB_2026_11_25} />
        </div>
      </article>
    </main>
  );
}
