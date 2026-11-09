import { LegalSections } from "@/components/legal-sections";
import { AVV, LEGAL_VERSION, PROVIDER, SUBPROCESSORS, TOMS } from "@/lib/legal-texts";

export const metadata = { title: "Auftragsverarbeitungsvertrag · performancegrowth", robots: { index: false, follow: true } };

export default function AvvPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Auftragsverarbeitungsvertrag</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          nach Art. 28 DSGVO · Auftragnehmer: {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city} · Stand {LEGAL_VERSION}
        </p>
        <p className="mt-6 text-[15px] leading-relaxed text-[#374151]">
          Dieser Vertrag ist Bestandteil des Vertrags über Leadgenerierung und Software und wird mit der Annahme des
          Angebots geschlossen.
        </p>
        <div className="mt-10">
          <LegalSections sections={AVV} />
        </div>
        <section className="mt-12">
          <h2 className="text-lg font-bold">Anlage 1: Technische und organisatorische Maßnahmen</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-[#374151]">
            {TOMS.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </section>
        <section className="mt-10">
          <h2 className="text-lg font-bold">Anlage 2: Unterauftragsverarbeiter</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#f6f7f9] text-left">
                  <th className="border border-[#e5e7eb] px-3 py-2 font-semibold">Unternehmen</th>
                  <th className="border border-[#e5e7eb] px-3 py-2 font-semibold">Zweck</th>
                  <th className="border border-[#e5e7eb] px-3 py-2 font-semibold">Ort</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s) => (
                  <tr key={s.name}>
                    <td className="border border-[#e5e7eb] px-3 py-2 font-medium">{s.name}</td>
                    <td className="border border-[#e5e7eb] px-3 py-2 text-[#374151]">{s.purpose}</td>
                    <td className="border border-[#e5e7eb] px-3 py-2 text-[#374151]">{s.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </article>
    </main>
  );
}
