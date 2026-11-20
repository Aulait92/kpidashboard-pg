import { notFound } from "next/navigation";
import { loadErstinfoByToken } from "@/lib/erstinformation";
import { DATENSCHUTZ_VERMITTLER_VERSION, datenschutzVermittler } from "@/lib/datenschutz-vermittler";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { policenSpeicherAnbieter } from "@/lib/legal-texts";

// Datenschutzhinweise im Namen des Vermittlers (Ole, 20.11.2026: „unter Datenschutz ist PG, unter Impressum Lohmann“).
// Verantwortlich für Lead- und Termindaten ist der Vermittler, wir sind Auftragsverarbeiter. Hat der Vermittler keine
// eigene Datenschutz-URL hinterlegt, verlinken Buchungsseite und Fußzeile hierher (lib/datenschutz-vermittler.ts).
export const dynamic = "force-dynamic";
export const metadata = { title: "Datenschutzhinweise", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function DatenschutzVermittlerPage({ params }: Props) {
  const { token } = await params;
  const e = await loadErstinfoByToken(token);
  if (!e) notFound();
  const d = e.daten;
  const abschnitte = datenschutzVermittler({ name: d.name ?? "", firma: d.firma ?? "", anschrift: d.anschrift ?? "", telefon: d.telefon ?? "", email: d.email ?? "", speicher: policenSpeicherAnbieter()?.name ?? null });
  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-[15px] leading-relaxed" data-datenschutz-vermittler>
          <h1 className="text-xl font-bold">Datenschutzhinweise</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Stand {DATENSCHUTZ_VERMITTLER_VERSION}</p>
          <div className="mt-5 space-y-5">
            {abschnitte.map((s) => (
              <section key={s.title}>
                <h2 className="font-semibold">{s.title}</h2>
                {s.items.map((t, i) => (
                  <p key={i} className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">
                    {t}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </div>
      </main>
      <LeadLegalFooter customerId={e.customerId} />
    </>
  );
}
