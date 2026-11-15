import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { Badge, Card } from "@/components/ui";
import { ImportButton } from "./import-button";

export const dynamic = "force-dynamic";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export default async function ImportPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  let rows: Awaited<ReturnType<typeof import("@/lib/ppl/import-airtable").importSubscriptions>> = [];
  let error: string | null = null;
  try {
    const { importSubscriptions } = await import("@/lib/ppl/import-airtable");
    rows = await importSubscriptions({ dryRun: true });
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/ppl" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Pay-per-Lead
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Bezüge aus Airtable übernehmen</h1>
      <p className="max-w-2xl text-sm text-[color:var(--muted)]">
        Vorschau, noch nichts geändert. Bezüge werden mit ihrem Airtable-Datensatz verknüpft (oder mit einem in der App angelegten Bezug
        desselben Kunden und Produkts). Erneutes Übernehmen aktualisiert Ziel, Preis, Filter, Storno-Fenster und -Gründe, Test und aktiv;
        Zeitraum (Wochenbestellung), Bezeichnung, Lieferweg mit Adresse, Vorlage und Webhook, „Storno immer anerkennen“ und Gebiete aus der App
        bleiben. Am besten zum Monatsanfang umstellen, weil Monatsziele in der App ab dem Stichtag zählen.
      </p>
      {rows.length ? (
        <p className="text-sm">
          {(["neu", "aktualisieren", "verknüpfen", "unverändert", "übersprungen"] as const)
            .map((a) => [a, rows.filter((r) => r.action === a).length] as const)
            .filter(([, n]) => n)
            .map(([a, n]) => `${n} ${a}`)
            .join(" · ")}
        </p>
      ) : null}
      {error ? <p className="rounded-[var(--radius-md)] bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-2">Bezug</th>
                <th className="px-3 py-2">Ziel</th>
                <th className="px-3 py-2">Preis</th>
                <th className="px-3 py-2">Filter</th>
                <th className="px-3 py-2">Storno</th>
                <th className="px-3 py-2">Lieferung</th>
                <th className="px-3 py-2">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.map((r) => (
                <tr key={r.airtableId} className={r.active ? "" : "opacity-60"}>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.bezug}</div>
                    <div className="text-xs text-[color:var(--muted)]">{r.active ? "aktiv" : "inaktiv"}</div>
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.goal ?? "–"} {r.period === "month" ? "/ Monat" : r.period === "once" ? "einmalig" : "/ Woche"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{eur(r.price)}</td>
                  <td className="px-3 py-2 text-xs text-[color:var(--muted)]">{r.filters || "–"}</td>
                  <td className="px-3 py-2 text-xs">{r.stornoDays ? `${r.stornoDays} Tage` : "–"}</td>
                  <td className="px-3 py-2 text-xs">{r.delivery}</td>
                  <td className="px-3 py-2">
                    <Badge tone={r.action === "übersprungen" ? "danger" : r.action === "neu" ? "success" : r.action === "unverändert" ? "neutral" : "warning"}>{r.action}</Badge>
                    {r.note ? <div className="mt-1 text-xs text-rose-700">{r.note}</div> : null}
                    {r.changes.length ? (
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {r.changes.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : null}
                    {r.kept.length ? (
                      <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--muted)]">
                        {r.kept.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {!error && rows.length ? <ImportButton /> : null}
    </main>
  );
}
