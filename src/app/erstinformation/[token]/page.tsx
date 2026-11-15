import { notFound, redirect } from "next/navigation";
import { loadErstinfoByToken } from "@/lib/erstinformation";
import { erstinfoAbschnitte, papierHinweis } from "@/lib/erstinformation-shared";
import { LeadLegalFooter } from "@/components/lead-legal-footer";

// Öffentliche Erstinformation eines Vermittlers (§ 15/16 VersVermV). Leads bekommen sie als PDF (WhatsApp-Dokument
// bzw. E-Mail-Anhang); diese Seite ist der zusätzliche Link. Eigenes PDF hochgeladen → PDF, sonst alle
// Pflichtangaben aus der Einrichtung (gleicher Text wie im erzeugten PDF, lib/erstinformation-shared.ts).
export const dynamic = "force-dynamic";
export const metadata = { title: "Erstinformation", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }> };

export default async function ErstinformationPage({ params }: Props) {
  const { token } = await params;
  const e = await loadErstinfoByToken(token);
  if (!e) notFound();
  if (e.fileName) redirect(`/erstinformation/${token}/pdf`);

  return (
    <>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-[15px] leading-relaxed" data-erstinfo-seite>
          <h1 className="text-xl font-bold">Erstinformation</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Angaben nach § 15 Versicherungsvermittlungsverordnung (VersVermV)</p>
          <dl className="mt-5 space-y-4">
            {erstinfoAbschnitte(e.daten).map((b) => (
              <div key={b.ueberschrift}>
                <dt className="text-sm text-[color:var(--muted)]">{b.ueberschrift}</dt>
                <dd className="whitespace-pre-line [overflow-wrap:anywhere]">{b.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-sm text-[color:var(--muted)]">
            {papierHinweis(e.an)}{" "}
            <a href={`/erstinformation/${token}/pdf`} className="font-medium text-[color:var(--brand)] underline">
              Als PDF speichern
            </a>
          </p>
        </div>
      </main>
      <LeadLegalFooter customerId={e.customerId} />
    </>
  );
}
