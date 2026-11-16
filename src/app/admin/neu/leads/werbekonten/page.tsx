import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Megaphone } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Ansichten } from "@/components/admin-neu/leads/ansichten";
import { loadOptimizationOverview, syncOptimizationAccounts } from "@/lib/optimierung/server";
import { STALE_DAYS } from "@/lib/optimierung/shared";
import { GlobalForm } from "@/app/admin/optimierung/ui";
import { MediaBuyerLayout } from "@/app/admin/media-buyer/media-buyer-admin";
import { loadMediaBuyer } from "@/app/admin/media-buyer/daten";

export const metadata = { title: "Werbekonten | performancegrowth Admin" };

// Leads & Kampagnen → Werbekonten: fasst /admin/optimierung (Maßnahmen je Werbekonto) und /admin/media-buyer
// (Tagesbudgets der Pay-per-Lead-Pools) zusammen. Zwei Ansichten statt zwei Seiten:
//   Konten (Start): je Werbekonto Modus, letzte Maßnahme (rot, wenn alt), offene Freigaben, letzter Lauf → Kontoansicht
//   Pool-Budgets: der Media Buyer unverändert (Pools mit Ist/Ziel/Prognose, Einstellungen, Simulieren/Anwenden)
// Die globalen Schalter der Optimierung liegen eingeklappt unten.

const PFAD = "/admin/neu/leads/werbekonten";
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  await connection();
  const { ansicht } = await searchParams;
  const pools = ansicht === "pools";
  return (
    <Seite titel="Leads & Kampagnen" reiter="leads" breit>
      <Ansichten
        aktiv={pools ? "pools" : ""}
        items={[
          { key: "", label: "Konten", href: PFAD },
          { key: "pools", label: "Pool-Budgets", href: `${PFAD}?ansicht=pools`, funktion: "media-buyer-admin--pool-liste-mit-ist-ziel-prognose-status-auf-kurs" },
        ]}
      />
      {pools ? <Pools /> : <Konten />}
    </Seite>
  );
}

async function Konten() {
  await syncOptimizationAccounts().catch(() => undefined);
  const { settings, rows } = await loadOptimizationOverview(new Date());
  const sortiert = [...rows.filter((r) => r.active), ...rows.filter((r) => !r.active)];
  const offen = rows.reduce((a, r) => a + r.planned, 0);
  return (
    <div className="space-y-4">
      <Card>
        <div data-funktion="page--werbekonten-liste-mit-modus-letzter-massnahme">
          <CardHeader title="Werbekonten" count={rows.filter((r) => r.active).length} hint={offen ? `${offen} Maßnahmen warten auf Freigabe` : `rot: letzte Maßnahme älter als ${STALE_DAYS} Tage`} />
          {sortiert.length ? (
            <ul className="divide-y divide-[color:var(--border)]">
              {sortiert.map((r) => (
                <li key={r.id}>
                  <Link href={`${PFAD}/${r.id}`} className={`flex items-center gap-3 px-4 py-3 text-sm hover:bg-[color:var(--surface-sunken)] sm:px-5 ${r.active ? "" : "opacity-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.label}</span>
                        <Badge tone={r.autopilot ? "warning" : "neutral"}>{r.autopilot ? "Autopilot" : "Vorschlag"}</Badge>
                        {r.kind === "pool" ? <Badge>Pool</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                        Letzte Maßnahme{" "}
                        <span className={r.stale ? "font-semibold text-rose-700" : ""} data-stale={r.stale ? "1" : undefined}>
                          {r.lastMeasureAt ? fmt(r.lastMeasureAt) : "noch keine"}
                        </span>
                        {" · "}
                        {r.lastRunAt ? `Lauf ${fmt(r.lastRunAt)}${r.lastRunNote ? `: ${r.lastRunNote}` : ""}` : "noch kein Lauf"}
                      </div>
                    </div>
                    {r.planned ? <Badge tone="brand">{r.planned} freigeben</Badge> : null}
                    {r.approved ? <Badge tone="success">{r.approved} freigegeben</Badge> : null}
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Megaphone} title="Noch keine Werbekonten." text="Kunden mit eigenem Meta-Werbekonto und aktive Pay-per-Lead-Bezüge erscheinen hier automatisch." />
          )}
        </div>
      </Card>
      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 text-sm font-semibold">
          <span className="flex-1">Wöchentlicher Lauf für alle Konten</span>
          <Badge tone={settings.enabled ? "success" : "neutral"}>{settings.enabled ? "an" : "aus"}</Badge>
        </summary>
        <div className="space-y-3 border-t border-[color:var(--border)] p-5">
          <GlobalForm enabled={settings.enabled} autopilot={settings.autopilot} />
          <p className="text-xs text-[color:var(--muted)]">
            Schwellen für müde Anzeigen stehen in der{" "}
            <Link href="/admin/einstellungen/kampagnen-automatik" className="underline">
              Kampagnen-Automatik
            </Link>
            .
          </p>
        </div>
      </details>
    </div>
  );
}

async function Pools() {
  const { pools, log, top, attribution } = await loadMediaBuyer();
  return (
    <div data-funktion="actions-savepoolsettings--autopilot-je-pool-an-aus actions-savepoolsettings--max-tagesbudget-je-kanal-meta-outbrain-tiktok actions-savepoolsettings--kampagnen-stichwort-je-kanal actions-rundryrun--trockenlauf-media-buyer actions-runapplynow--jetzt-anwenden-budgets-setzen media-buyer-admin--empfehlung-verlauf-der-aktionen-performance-pro">
      <p className="mb-3 text-sm text-[color:var(--muted)]">
        {top.monthLabel} · Tag {top.daysElapsed}/{top.daysTotal} · {Math.max(0, top.daysTotal - top.daysElapsed)} Tage übrig
      </p>
      <MediaBuyerLayout pools={pools} log={log} top={top} attribution={attribution} ohneLeiste />
    </div>
  );
}
