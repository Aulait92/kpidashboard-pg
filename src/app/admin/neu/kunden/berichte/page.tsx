import Link from "next/link";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Chips } from "@/components/admin-neu/kunden/chips";
import { RATING_TONE } from "@/components/admin-neu/kunden/bericht-bewertung";
import { GenerateNow } from "@/app/admin/monatsberichte/forms";
import { requireAuth } from "@/lib/vertrieb/auth";
import { listReports, loadReportSettings } from "@/lib/monatsbericht/server";
import { monthLabel, previousMonthKey, shiftMonth, STATUS_LABEL } from "@/lib/monatsbericht/shared";

export const metadata = { title: "Monatsberichte | performancegrowth Admin" };

const FILTER = [
  { key: "", label: "Alle" },
  { key: "draft", label: "Zu prüfen" },
  { key: "call", label: "Anrufen" },
  { key: "sent", label: "Gesendet" },
  { key: "skipped", label: "Ausgesetzt" },
] as const;

// Kunden › Monatsberichte: alle Berichte eines Monats (blättern), Filter nach Stand, „Fehlende Berichte jetzt erstellen“.
// Ein Klick öffnet den Bericht in der Kundenakte (Reiter Monatsberichte). Daten und Actions wie /admin/monatsberichte.
export default async function MonatsberichteAlle({ searchParams }: { searchParams: Promise<{ monat?: string; stand?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.monat ?? "") ? sp.monat! : previousMonthKey(new Date());
  const stand = FILTER.some((f) => f.key === sp.stand) ? (sp.stand ?? "") : "";
  const [rows, settings] = await Promise.all([listReports(month), loadReportSettings()]);
  const sichtbar = stand ? rows.filter((r) => r.status === stand) : rows;
  const basis = (m: string, s = stand) => `/admin/neu/kunden/berichte?monat=${m}${s ? `&stand=${s}` : ""}`;

  return (
    <Seite titel="Kunden" reiter="kunden" untertitel={settings.autoSendGood ? "Nur „gut“ mit Maßnahme geht automatisch raus, alles andere prüfen Sie." : "Nichts geht automatisch raus: Sie prüfen jeden Bericht."}>
      <div className="space-y-4" data-funktion="page--monatsuebersicht-aller-berichte-mit-monat-vor">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 text-sm">
            <Link className="btn-ghost h-10 w-10 px-0" aria-label={monthLabel(shiftMonth(month, -1))} href={basis(shiftMonth(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-[8.5rem] text-center font-semibold">{monthLabel(month)}</span>
            <Link className="btn-ghost h-10 w-10 px-0" aria-label={monthLabel(shiftMonth(month, 1))} href={basis(shiftMonth(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div data-funktion="actions-generatenowaction--berichte-jetzt-erzeugen">
            <GenerateNow month={month} />
          </div>
        </div>

        <Chips
          eintraege={FILTER.map((f) => ({ label: f.label, href: basis(month, f.key), anzahl: f.key ? rows.filter((r) => r.status === f.key).length : rows.length, aktiv: f.key === stand, immer: !f.key }))}
        />

        <Card>
          {sichtbar.length ? (
            <ul className="divide-y divide-[color:var(--border)]">
              {sichtbar.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/admin/neu/kunden/${r.customer.id}/berichte?bericht=${r.id}#bericht`}
                    className="flex min-h-14 items-center gap-3 px-5 py-3 text-sm transition hover:bg-[color:var(--surface-sunken)]"
                    data-report-row={r.status}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.customer.name.replace(/^Allianz\s+/i, "")}</span>
                      <span className="block text-xs text-[color:var(--muted)]">
                        {STATUS_LABEL[r.status] ?? r.status}
                        {r.dataQuality === "unsicher" ? " · Daten unsicher" : ""}
                        {r.customer.monthlyReportsOff ? " · Berichte aus" : ""}
                      </span>
                    </span>
                    <Badge tone={RATING_TONE[r.rating] ?? "neutral"}>{r.rating}</Badge>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FileText}
              title={rows.length ? "Kein Bericht in diesem Stand" : `Für ${monthLabel(month)} gibt es noch keine Berichte`}
              text={rows.length ? undefined : "Sie entstehen automatisch ab dem 2. des Folgemonats. Fehlende lassen sich oben jetzt erstellen."}
            />
          )}
        </Card>
      </div>
    </Seite>
  );
}
