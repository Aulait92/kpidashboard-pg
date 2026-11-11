import { connection } from "next/server";
import { RechnerView } from "@/components/rechner-view";
import { inputFromParams } from "@/lib/rechner";
import { cplInfos, loadRechnerConfig } from "@/lib/rechner-server";

export const metadata = {
  title: "Rechner · performancegrowth",
  description: "Rechnet sich Leadgenerierung für Sie? Werbebudget und Provision eingeben, Break-even sehen.",
};

// Öffentlicher Break-even-Rechner für Verkaufsgespräche und Website. Alle
// Eingaben stehen in der URL (teilbar), gespeichert wird nichts.
export default async function RechnerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const config = await loadRechnerConfig();
  const [cpl, q] = await Promise.all([cplInfos(config), searchParams]);
  return <RechnerView config={config} cpl={cpl} initial={inputFromParams(config, q)} />;
}
