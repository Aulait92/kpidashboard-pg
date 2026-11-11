import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadZahlen } from "@/lib/zahlen";
import { parseSicht } from "@/lib/zahlen-sicht";
import { loadProdukte } from "@/lib/produkte";
import { loadVertriebZahlen } from "@/lib/vertrieb-zahlen";
import { loadBwa } from "@/lib/bwa";
import { ZahlenView } from "@/components/admin/zahlen-view";

export const metadata = { title: "Zahlen | KPI-Dashboard" };

// Investorentaugliche Kennzahlen aus dem Umsatzbuch (lib/revenue-ledger.ts).
// ?zeitraum= steuert den Tab „Produkte“ (lib/produkte.ts), ?vzeitraum= den Tab „Vertrieb“, ?bwa= den Tab „BWA“,
// ?sicht=kern|gesamt die Kennzahlen (Kerngeschäft ohne Pay-per-Lead-Pilot oder Gesamt).
export default async function AdminZahlenPage({ searchParams }: { searchParams: Promise<{ zeitraum?: string; vzeitraum?: string; bwa?: string; sicht?: string }> }) {
  await connection();
  await requireAuth();
  const { zeitraum, vzeitraum, bwa: bwaParam, sicht } = await searchParams;
  const [data, produkte, vertrieb, bwa] = await Promise.all([loadZahlen(new Date(), parseSicht(sicht)), loadProdukte(zeitraum), loadVertriebZahlen(vzeitraum), loadBwa(bwaParam)]);
  return (
    <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenView data={data} produkte={produkte} vertrieb={vertrieb} bwa={bwa} />
    </main>
  );
}
