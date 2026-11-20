import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeft, ChevronRight, Megaphone, Wallet } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { loadOptimizationOverview, syncOptimizationAccounts } from "@/lib/optimierung/server";
import { STALE_DAYS } from "@/lib/optimierung/shared";
import { GlobalForm } from "@/app/admin/optimierung/ui";
import { MediaBuyerLayout } from "@/app/admin/media-buyer/media-buyer-admin";
import { loadMediaBuyer } from "@/app/admin/media-buyer/daten";
import { ladeLeadpreise } from "@/lib/optimierung/leadpreis-server";
import { LEADPREIS_TAGE, UEBER_ZIEL_EUR } from "@/lib/optimierung/leadpreis";
import { cn } from "@/lib/utils";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

export const metadata = { title: "Werbekonten | performancegrowth Admin" };

// Liefern → Werbekonten: fasst /admin/optimierung (Maßnahmen je Werbekonto) und /admin/media-buyer (Tagesbudgets der
// Pay-per-Lead-Pools) zusammen. UX-Umbau 20.11.2026 (Ziel SUS 90+): keine Umschalter mehr, sondern zwei Abschnitte:
//   Kundenkonten: je Konto Leadpreis 7 Tage gegen Ziel (teuerste zuerst), Modus und letzte Maßnahme; wartet etwas auf
//   Freigabe, steht rechts „Freigeben“ (führt in die Kontoansicht, dort freigeben oder ablehnen)
//   Pay-per-Lead-Pools: die Pool-Konten, oben rechts „Tagesbudgets“ (Media Buyer, ?ansicht=pools, Unteransicht)
// Der wöchentliche Lauf für alle Konten liegt eingeklappt unten. Leadpreis aus AdSpendDaily gegen den Ziel-Leadpreis;
// mehr als 5 € über Ziel rot und als Punkt in „Braucht Aufmerksamkeit“ (Liefern, Mein Tag).

const PFAD = "/admin/neu/leads/werbekonten";
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);

export default async function Page({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  await connection();
  const { ansicht } = await searchParams;
  const pools = ansicht === "pools";
  return (
    <Seite titel="Liefern" reiter="liefern" breit>
      {pools ? <Pools /> : <Konten />}
    </Seite>
  );
}

type Zeile = Awaited<ReturnType<typeof loadOptimizationOverview>>["rows"][number];
type Preise = Awaited<ReturnType<typeof ladeLeadpreise>>;

async function Konten() {
  await syncOptimizationAccounts().catch(() => undefined);
  const [{ settings, rows }, preise] = await Promise.all([loadOptimizationOverview(new Date()), ladeLeadpreise()]);
  const preis = new Map(preise.konten.map((k) => [k.id, k]));
  // Teuerste zuerst (Reihenfolge aus ladeLeadpreise), inaktive Konten ans Ende
  const rang = new Map(preise.konten.map((k, i) => [k.id, i]));
  const nachPreis = (a: Zeile, b: Zeile) => (rang.get(a.id) ?? 1e6) - (rang.get(b.id) ?? 1e6);
  const sortiert = [...rows.filter((r) => r.active).sort(nachPreis), ...rows.filter((r) => !r.active).sort(nachPreis)];
  const kunden = sortiert.filter((r) => r.kind !== "pool");
  const poolKonten = sortiert.filter((r) => r.kind === "pool");
  const offen = rows.reduce((a, r) => a + r.planned, 0);
  return (
    <div className="space-y-4">
      <Card>
        <div data-funktion="page--werbekonten-liste-mit-modus-letzter-massnahme">
          <CardHeader title="Kundenkonten" count={kunden.filter((r) => r.active).length} hint={offen ? `${offen} ${offen === 1 ? "Maßnahme wartet" : "Maßnahmen warten"} auf Freigabe` : undefined} />
          {!preise.datenDa ? (
            <p className="border-b border-[color:var(--border)] px-4 py-3 text-sm text-[color:var(--muted)] sm:px-5" data-leadpreis-leer="">
              Leadpreis {LEADPREIS_TAGE} Tage: erste Werte nach dem nächsten Abgleich der Werbekosten (täglich früh morgens).
            </p>
          ) : null}
          {kunden.length ? (
            <ul className="divide-y divide-[color:var(--border)]">
              {kunden.map((r) => (
                <KontoZeile key={r.id} r={r} k={preis.get(r.id)} />
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Megaphone}
              title="Noch keine Kundenkonten."
              text="Kunden mit eigenem Meta-Werbekonto erscheinen hier automatisch."
              action={
                <ButtonLink href="/admin/neu/kunden" variant="secondary">
                  Zu den Kunden
                </ButtonLink>
              }
            />
          )}
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Pay-per-Lead-Pools"
          count={poolKonten.filter((r) => r.active).length}
          actions={
            <span data-funktion="media-buyer-admin--pool-liste-mit-ist-ziel-prognose-status-auf-kurs">
              <ButtonLink href={`${PFAD}?ansicht=pools`} icon={Wallet}>
                Tagesbudgets
              </ButtonLink>
            </span>
          }
        />
        {poolKonten.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {poolKonten.map((r) => (
              <KontoZeile key={r.id} r={r} k={preis.get(r.id)} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-[color:var(--muted)] sm:px-5">Pool-Konten erscheinen, sobald ein Pay-per-Lead-Bezug aktiv ist.</p>
        )}
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
            <Link href="/admin/neu/einstellungen/kampagnen-automatik" className="underline">
              Kampagnen-Automatik
            </Link>
            .
          </p>
        </div>
      </details>
    </div>
  );
}

/** Eine Zeile je Werbekonto: Name, Modus und letzte Maßnahme; rechts Leadpreis und, wenn nötig, „Freigeben“. */
function KontoZeile({ r, k }: { r: Zeile; k: Preise["konten"][number] | undefined }) {
  return (
    <li>
      <Link href={`${PFAD}/${r.id}`} className={`flex min-h-14 items-center gap-3 px-4 py-3 text-sm hover:bg-[color:var(--surface-sunken)] sm:px-5 ${r.active ? "" : "opacity-50"}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{r.label}</div>
          <div className="mt-0.5 text-xs text-[color:var(--muted)]">
            {r.autopilot ? "Autopilot" : "Vorschlag"} ·{" "}
            <span className={r.stale ? "font-semibold text-rose-700" : ""} data-stale={r.stale ? "1" : undefined} title={r.stale ? `älter als ${STALE_DAYS} Tage` : undefined}>
              {r.lastMeasureAt ? `Maßnahme ${fmt(r.lastMeasureAt)}` : "keine Maßnahme"}
            </span>
          </div>
        </div>
        <LeadpreisZelle k={k} />
        {r.planned ? (
          <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-amber-100 px-2.5 text-xs font-semibold text-amber-800" aria-label={`${r.planned} Maßnahmen freigeben`}>
            <span className="hidden sm:inline">Freigeben&nbsp;</span>
            {r.planned}
          </span>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
        )}
      </Link>
    </li>
  );
}

/** „Leadpreis 7 Tage“ gegen Ziel; rot ab 5 € über Ziel. Ohne Leads im Zeitraum: Strich. */
function LeadpreisZelle({ k }: { k: Awaited<ReturnType<typeof ladeLeadpreise>>["konten"][number] | undefined }) {
  const lp = k?.leadpreis;
  return (
    <span className="w-24 shrink-0 text-right sm:w-32" data-leadpreis={lp?.cpl ?? ""} title={k ? `Ziel: ${k.zielLabel}` : undefined}>
      <span className={cn("block tabular-nums", lp?.cpl != null ? "font-semibold" : "whitespace-nowrap text-xs text-[color:var(--muted)]", lp?.zuTeuer ? "text-rose-700" : "")}>{lp?.cpl != null ? eur(lp.cpl) : NOCH_KEINE_DATEN}</span>
      <span className="block text-xs text-[color:var(--muted)]">
        {lp?.ziel != null ? `Ziel ${eur(lp.ziel)}` : `${LEADPREIS_TAGE} Tage`}
        {lp?.zuTeuer && lp.ueberZiel != null ? <span className="sr-only"> (mehr als {UEBER_ZIEL_EUR} € über Ziel)</span> : null}
      </span>
    </span>
  );
}

async function Pools() {
  const { pools, log, top, attribution } = await loadMediaBuyer();
  return (
    <div className="space-y-3">
      <Link href={PFAD} className="-ml-1 inline-flex min-h-10 items-center gap-1 text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        <ChevronLeft className="h-4 w-4" />
        Werbekonten
      </Link>
      <div data-funktion="actions-savepoolsettings--autopilot-je-pool-an-aus actions-savepoolsettings--max-tagesbudget-je-kanal-meta-outbrain-tiktok actions-savepoolsettings--kampagnen-stichwort-je-kanal actions-rundryrun--trockenlauf-media-buyer actions-runapplynow--jetzt-anwenden-budgets-setzen media-buyer-admin--empfehlung-verlauf-der-aktionen-performance-pro">
        <h2 className="text-[15px] font-semibold">Tagesbudgets der Pools</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          {top.monthLabel} · Tag {top.daysElapsed}/{top.daysTotal} · {Math.max(0, top.daysTotal - top.daysElapsed)} Tage übrig
        </p>
        <MediaBuyerLayout pools={pools} log={log} top={top} attribution={attribution} ohneLeiste />
      </div>
    </div>
  );
}
