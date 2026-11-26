import { LegalSections } from "@/components/legal-sections";
import { agbFuerAngebot, agbOeffentlichJePaket, LEGAL_VERSION, PROVIDER, type LegalSection } from "@/lib/legal-texts";

export const metadata = { title: "AGB · performancegrowth", robots: { index: false, follow: true } };

// Öffentliche AGB (Ole, 26.11.2026): vollständig, gegliedert je Paket. Jedes Angebot zeigt nur die Abschnitte, die
// dafür gelten (lib/agb-angebot.ts, /angebot/[token]/agb). Hier steht je Paket die Fassung mit allem, was ein Angebot
// dieses Pakets enthalten oder zur Wahl stellen kann (z. B. Vorauszahlung, Zugänge, Zusatzmodule).
// Alte Links ?paket=ppl bzw. ?paket=ppl_software (&variante=kundenkonto) zeigen weiter nur das eine Paket.
const UNTERTITEL: Record<string, string> = {
  ppl: "für den Kauf von Leads per Stück (Paket „Nur Leads“)",
  ppl_software: "für Pay-per-Lead + Software",
};

function Besondere({ sections }: { sections: LegalSection[] }) {
  return (
    <div className="mt-10">
      <h3 className="text-xl font-bold tracking-tight">Besondere Bedingungen</h3>
      <p className="mb-6 mt-1 text-sm text-[#6b7280]">Bestandteil des Angebots, gehen den AGB vor.</p>
      <LegalSections sections={sections} />
    </div>
  );
}

export default async function AgbPage({ searchParams }: { searchParams: Promise<{ paket?: string; variante?: string }> }) {
  const { paket, variante } = await searchParams;
  const lead = paket === "ppl" || paket === "ppl_software";
  const einzeln = lead ? agbFuerAngebot({ package: paket, kundenkonto: variante === "kundenkonto" }) : null;
  const pakete = einzeln ? [] : agbOeffentlichJePaket();
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Allgemeine Geschäftsbedingungen</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          {lead ? UNTERTITEL[paket] : "für Leadgenerierung und Software"} · {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city} · Stand {LEGAL_VERSION}
        </p>
        {einzeln ? (
          <>
            <div className="mt-10">
              <LegalSections sections={einzeln.agb} />
            </div>
            {einzeln.besondere ? <Besondere sections={einzeln.besondere} /> : null}
          </>
        ) : (
          <>
            <p className="mt-6 rounded-lg bg-[#f3f6fd] px-4 py-3 text-sm text-[#374151]" data-agb-hinweis>
              Welche Abschnitte für Sie gelten, steht in Ihrem Angebot.
            </p>
            <nav className="mt-6 text-sm" aria-label="Pakete">
              <ul className="space-y-1.5">
                {pakete.map((p) => (
                  <li key={p.id}>
                    <a href={`#${p.id}`} className="font-medium text-[#2563EB] underline">
                      {p.titel}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            {pakete.map((p) => (
              <section key={p.id} id={p.id} className="mt-14 scroll-mt-6" data-agb-paket={p.id}>
                <h2 className="text-2xl font-bold tracking-tight">{p.titel}</h2>
                {p.hinweis ? <p className="mt-2 text-sm text-[#6b7280]">{p.hinweis}</p> : null}
                <div className="mt-8">
                  <LegalSections sections={p.agb} />
                </div>
                {p.besondere ? <Besondere sections={p.besondere} /> : null}
              </section>
            ))}
          </>
        )}
      </article>
    </main>
  );
}
