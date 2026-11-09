import { LegalSections } from "@/components/legal-sections";
import { AGB, LEGAL_VERSION, PROVIDER } from "@/lib/legal-texts";

export const metadata = { title: "AGB · performancegrowth", robots: { index: false, follow: true } };

export default function AgbPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Allgemeine Geschäftsbedingungen</h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          für Leadgenerierung und Software · {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city} · Stand {LEGAL_VERSION}
        </p>
        <div className="mt-10">
          <LegalSections sections={AGB} />
        </div>
      </article>
    </main>
  );
}
