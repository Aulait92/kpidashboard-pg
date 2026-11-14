import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadZahlen } from "@/lib/zahlen";
import { parseSicht } from "@/lib/zahlen-sicht";
import { loadProdukte } from "@/lib/produkte";
import { loadVertriebZahlen } from "@/lib/vertrieb-zahlen";
import { loadBwa } from "@/lib/bwa";
import { ZahlenView } from "@/components/admin/zahlen-view";
import { ZahlenTabs } from "@/components/admin/zahlen-tabs";
import { countNeueBuchungen } from "@/lib/admin-buchungen-neu";
import { reportError } from "@/lib/monitoring";

export const metadata = { title: "Zahlen | performancegrowth Admin" };

// Investorentaugliche Kennzahlen aus dem Umsatzbuch (lib/revenue-ledger.ts).
// ?zeitraum= steuert den Tab „Produkte“ (lib/produkte.ts), ?vzeitraum= den Tab „Vertrieb“, ?bwa= den Tab „BWA“,
// ?sicht=kern|gesamt die Kennzahlen (Kerngeschäft ohne Pay-per-Lead-Pilot oder Gesamt).
export default async function AdminZahlenPage({ searchParams }: { searchParams: Promise<{ zeitraum?: string; vzeitraum?: string; bwa?: string; sicht?: string }> }) {
  await connection();
  const session = await requireAuth();
  const { zeitraum, vzeitraum, bwa: bwaParam, sicht } = await searchParams;
  const [data, produkte, vertrieb, bwa, neueBuchungen] = await Promise.all([
    loadZahlen(new Date(), parseSicht(sicht)),
    loadProdukte(zeitraum),
    loadVertriebZahlen(vzeitraum),
    loadBwa(bwaParam),
    countNeueBuchungen(session.userId).catch((err) => {
      reportError(err, "admin-neue-buchungen");
      return 0;
    }),
  ]);
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenTabs neueBuchungen={neueBuchungen} />
      <ZahlenView data={data} produkte={produkte} vertrieb={vertrieb} bwa={bwa} />
    </main>
  );
}
