import { notFound } from "next/navigation";
import { loadErstinfoByToken } from "@/lib/erstinformation";
import { datenschutzPolicenAbschnitte } from "@/lib/policen/datenschutz-text";
import { DATENSCHUTZ_VERSION } from "@/lib/policen/regeln";
import { LeadLegalFooter } from "@/components/lead-legal-footer";

// Langfassung zur Einwilligung „Unterlagen per WhatsApp“ (Ole, 17.11.2026, lib/policen): öffentliche Seite des
// Vermittlers (lib/policen/verantwortlicher.ts policenDatenschutzUrl). k = Token der Erstinformation (zufällig, ändert
// sich nicht). Texte: lib/policen/datenschutz-text.ts.
export const dynamic = "force-dynamic";
export const metadata = { title: "Datenschutz: Unterlagen per WhatsApp", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ k?: string | string[] }> };

export default async function DatenschutzPolicenPage({ searchParams }: Props) {
  const { k } = await searchParams;
  const token = Array.isArray(k) ? k[0] : k;
  const e = token ? await loadErstinfoByToken(token) : null;
  if (!e) notFound();
  const abschnitte = datenschutzPolicenAbschnitte(e.an, { name: e.daten.name, firma: e.daten.firma, anschrift: e.daten.anschrift, telefon: e.daten.telefon, email: e.daten.email });

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-[15px] leading-relaxed" data-datenschutz-policen>
          <h1 className="text-xl font-bold">Unterlagen per WhatsApp</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Datenschutzhinweis zur Einwilligung (Art. 13 DSGVO)</p>
          <dl className="mt-5 space-y-4">
            {abschnitte.map((b) => (
              <div key={b.ueberschrift}>
                <dt className="text-sm font-semibold">{b.ueberschrift}</dt>
                <dd className="whitespace-pre-line [overflow-wrap:anywhere]">{b.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-xs text-[color:var(--muted)]">Fassung {DATENSCHUTZ_VERSION}</p>
        </div>
      </main>
      <LeadLegalFooter customerId={e.customerId} />
    </>
  );
}
