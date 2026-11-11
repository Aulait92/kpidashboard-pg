import Link from "next/link";
import { connection } from "next/server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cplFromData, loadRechnerConfig } from "@/lib/rechner-server";
import { RechnerForm } from "./form";

export const metadata = { title: "Rechner | performancegrowth Admin" };

// Einstellungen des öffentlichen Break-even-Rechners: Produkte mit
// Erfahrungswerten, Texte, Kontakt-Link und Garantien.
export default async function RechnerEinstellungenPage() {
  await connection();
  await requireAuth();
  const config = await loadRechnerConfig();
  const data = await Promise.all(config.products.map((p) => cplFromData(p).catch(() => null)));
  const dataInfo = Object.fromEntries(config.products.map((p, i) => [p.key, data[i]]));
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Rechner</h1>
          <a href="/rechner" target="_blank" rel="noopener" className="text-sm font-medium text-[color:var(--brand)] hover:underline">Rechner öffnen ↗</a>
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          Öffentlicher Break-even-Rechner für Verkaufsgespräche und Website. Kosten pro Lead: Echte Daten ersetzen den Erfahrungswert nur, wenn sie höher sind (Puffer bleibt).
        </p>
      </div>
      <RechnerForm config={config} dataInfo={dataInfo} />
    </main>
  );
}
