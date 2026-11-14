import Link from "next/link";
import { connection } from "next/server";
import { Badge, Card, CardHeader } from "@/components/ui";
import { loadOptimizationOverview, syncOptimizationAccounts } from "@/lib/optimierung/server";
import { STALE_DAYS } from "@/lib/optimierung/shared";
import { requireAuth } from "@/lib/vertrieb/auth";
import { GlobalForm } from "./ui";

export const metadata = { title: "Optimierung | performancegrowth Admin" };

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);

// Übersicht: alle Werbekonten (eigene Kundenkonten und Pay-per-Lead-Pools) mit dem Datum der
// letzten ausgeführten Maßnahme; rot bei mehr als 14 Tagen.
export default async function OptimierungPage() {
  await connection();
  await requireAuth();
  await syncOptimizationAccounts().catch(() => undefined);
  const now = new Date();
  const { settings, rows } = await loadOptimizationOverview(now);
  const active = rows.filter((r) => r.active);
  const inactive = rows.filter((r) => !r.active);
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/admin/einstellungen" className="text-sm text-[color:var(--muted)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Optimierung je Werbekonto</h1>
      <p className="mb-5 max-w-3xl text-sm text-[color:var(--muted)]">
        Wöchentlich je Konto: neue Motive bei Ermüdung bzw. spätestens alle 4 Wochen, schwache Anzeigen pausieren, Budget innerhalb des vereinbarten Budgets umschichten, bei schlechter Leadqualität ein Vorschlag an Ole. Höchstens eine größere Änderung je Anzeigengruppe und Woche.
      </p>
      <div className="grid gap-5 xl:grid-cols-[3fr_1fr]">
        <Card>
          <CardHeader title="Werbekonten" count={active.length} hint={`rot: letzte Maßnahme älter als ${STALE_DAYS} Tage`} />
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">Konto</th>
                  <th className="py-2 pr-3 font-medium">Modus</th>
                  <th className="py-2 pr-3 font-medium">Letzte Maßnahme</th>
                  <th className="py-2 pr-3 font-medium">Offen</th>
                  <th className="py-2 font-medium">Letzter Lauf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {[...active, ...inactive].map((r) => (
                  <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/optimierung/${r.id}`} className="font-medium hover:underline">
                        {r.label}
                      </Link>
                      <span className="ml-2 text-xs text-[color:var(--muted)]">{r.kind === "pool" ? "Pool" : r.adAccountId ? `act_${r.adAccountId}` : ""}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={r.autopilot ? "warning" : "neutral"}>{r.autopilot ? "Autopilot" : "Vorschlag"}</Badge>
                      {r.modeFromAccount ? <span className="ml-1 text-xs text-[color:var(--muted)]">Konto</span> : null}
                    </td>
                    <td className={`py-2 pr-3 tabular-nums ${r.stale ? "font-semibold text-rose-700" : ""}`} data-stale={r.stale ? "1" : undefined}>
                      {r.lastMeasureAt ? fmt(r.lastMeasureAt) : "noch keine"}
                    </td>
                    <td className="py-2 pr-3">
                      {r.planned ? <Badge tone="brand">{r.planned} geplant</Badge> : null} {r.approved ? <Badge tone="success">{r.approved} freigegeben</Badge> : null}
                    </td>
                    <td className="py-2 text-xs text-[color:var(--muted)]">{r.lastRunAt ? `${fmt(r.lastRunAt)}${r.lastRunNote ? `: ${r.lastRunNote}` : ""}` : "noch kein Lauf"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? <p className="py-4 text-sm text-[color:var(--muted)]">Noch keine Werbekonten: Kunden mit eigenem Meta-Werbekonto bzw. aktive Pay-per-Lead-Bezüge erscheinen hier automatisch.</p> : null}
          </div>
        </Card>
        <div className="space-y-3">
          <h2 className="font-medium">Global</h2>
          <GlobalForm enabled={settings.enabled} autopilot={settings.autopilot} />
          <p className="text-xs text-[color:var(--muted)]">
            Schwellen für müde Anzeigen (Frequenz, CTR, Leadpreis, Mindestausgaben) kommen aus der{" "}
            <Link href="/admin/einstellungen/kampagnen-automatik" className="underline">
              Kampagnen-Automatik
            </Link>
            . Neue Motive entstehen über die Kampagnen-Agenten inklusive Prüfung und liegen pausiert bereit.
          </p>
        </div>
      </div>
    </main>
  );
}
