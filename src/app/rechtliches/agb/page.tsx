import { LegalSections } from "@/components/legal-sections";
import { AGB, agbFuerAngebot, LEGAL_VERSION, PROVIDER } from "@/lib/legal-texts";

export const metadata = { title: "AGB · performancegrowth", robots: { index: false, follow: true } };

// Leadangebote (Ole, 24.11.2026): ?paket=ppl („Nur Leads“) bzw. ?paket=ppl_software (Pay-per-Lead + Software,
// &variante=kundenkonto für Kampagnen im eigenen Werbekonto) zeigen nur die Abschnitte, die für dieses Paket gelten
// (lib/legal-texts.ts agbFuerAngebot); die Annahmeseite verlinkt so. Ohne Parameter: allgemeine AGB.
const UNTERTITEL: Record<string, string> = {
  ppl: "für den Kauf von Leads per Stück (Paket „Nur Leads“)",
  ppl_software: "für Pay-per-Lead + Software",
};

export default async function AgbPage({ searchParams }: { searchParams: Promise<{ paket?: string; variante?: string }> }) {
  const { paket, variante } = await searchParams;
  const lead = paket === "ppl" || paket === "ppl_software";
  const { agb, besondere } = lead ? agbFuerAngebot({ package: paket, kundenkonto: variante === "kundenkonto" }) : { agb: AGB, besondere: null };
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Allgemeine Geschäftsbedingungen</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          {lead ? UNTERTITEL[paket] : "für Leadgenerierung und Software"} · {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city} · Stand {LEGAL_VERSION}
        </p>
        <div className="mt-10">
          <LegalSections sections={agb} />
        </div>
        {besondere ? (
          <div className="mt-12">
            <h2 className="text-2xl font-bold tracking-tight">Besondere Bedingungen</h2>
            <p className="mb-8 mt-2 text-sm text-[#6b7280]">Bestandteil des Angebots, gehen den AGB vor.</p>
            <LegalSections sections={besondere} />
          </div>
        ) : null}
      </article>
    </main>
  );
}
