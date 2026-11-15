import type { Metadata } from "next";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { DemoAnsicht } from "./demo-ansicht";

// Öffentliche Live-Demo der Beratungspräsentation (Ole, 15.11.2026): ohne Login, feste Beispieldaten (src/lib/demo-beratung.ts),
// alles rechnet im Browser. Erreichbar unter www.dein-beratungstermin.de/demo und app.performancegrowth.de/demo/beratung.
// ?eingebettet=1: knappe Ansicht für die Vertriebspräsentation (Folie „Beraten mit echten Preisen“). Startet immer mit
// Folie 1, auch eingebettet (Ole, 15.11.2026): kein Sprung per Adresse, kein gespeicherter Stand.
export const metadata: Metadata = {
  title: "Beratungspräsentation: Live-Demo",
  description: "So sieht eine Beratung mit echten Preisen im Termin aus: Tarif wählen, Bausteine an- und abwählen, der Beitrag rechnet sich sofort neu.",
  robots: { index: false, follow: false },
};

export default async function DemoBeratungPage({ searchParams }: { searchParams: Promise<{ eingebettet?: string }> }) {
  const { eingebettet } = await searchParams;
  if (eingebettet === "1") {
    return (
      <main className="flex h-dvh w-full items-center bg-white p-1" data-demo-eingebettet>
        <DemoAnsicht eingebettet />
      </main>
    );
  }
  return (
    <>
      <div className="bg-[color:var(--brand)] px-4 py-2 text-center text-sm font-medium text-white" data-demo-banner>
        Demo mit Beispieldaten
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6" data-demo-beratung>
        <h1 className="text-xl font-bold [text-wrap:balance] sm:text-2xl">So sieht Ihre Beratung im Termin aus</h1>
        <p className="mt-1 max-w-3xl text-sm text-[color:var(--muted)]">
          Klicken Sie sich durch wie im echten Termin: Tarif auswählen, Bausteine an- und abwählen, der Beitrag rechnet sich sofort neu. Blättern mit den
          Pfeiltasten oder per Wischen, „Vollbild“ zum Teilen im Videocall.
        </p>
        <div className="mt-4">
          <DemoAnsicht />
        </div>
        <p className="mt-3 text-sm text-[color:var(--muted)] sm:hidden">Tipp: Handy quer halten, dann wird die Folie größer.</p>
        <p className="mt-4 text-xs text-[color:var(--muted)]">
          Alle Namen, Tarife und Preise sind Beispiele. Nichts wird gespeichert, neu laden setzt die Demo zurück.
        </p>
      </main>
      <LeadLegalFooter />
    </>
  );
}
