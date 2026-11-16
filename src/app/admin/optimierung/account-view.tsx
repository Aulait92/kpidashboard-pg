import Link from "next/link";
import { Badge, Card, CardHeader } from "@/components/ui";
import { isSuggestion, type MeasureKind } from "@/lib/optimierung/regeln";
import { activityLabel, KIND_LABEL, STATUS_LABEL, type MeasureStatus } from "@/lib/optimierung/shared";
import type { loadAccountDetail } from "@/lib/optimierung/server";
import { AccountSettingsForm, ManualForm, PlannedList, RunPanel, type MeasureView } from "./ui";
import { AdminBack } from "@/components/admin/admin-back";

type Detail = NonNullable<Awaited<ReturnType<typeof loadAccountDetail>>>;
type MeasureRow = Detail["measures"][number];

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit" }).format(d);
const fmtTime = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

const STATUS_TONE: Record<MeasureStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  geplant: "neutral",
  freigegeben: "brand",
  ausgefuehrt: "success",
  abgelehnt: "warning",
  fehlgeschlagen: "danger",
};

export const toView = (m: MeasureRow): MeasureView => ({
  id: m.id,
  kind: m.kind,
  status: m.status,
  title: m.title,
  reason: m.reason,
  targetName: m.targetName,
  result: m.result,
  source: m.source,
  plannedAt: m.plannedAt.toISOString(),
  executedAt: m.executedAt?.toISOString() ?? null,
  decidedBy: m.decidedBy,
  suggestion: isSuggestion(m.kind),
});

/** Protokoll (ausgeführt, abgelehnt, fehlgeschlagen), neueste zuerst. */
export function ProtocolCard({ measures }: { measures: MeasureRow[] }) {
  const rows = measures.filter((m) => !["geplant", "freigegeben"].includes(m.status)).sort((a, b) => (b.executedAt ?? b.decidedAt ?? b.plannedAt).getTime() - (a.executedAt ?? a.decidedAt ?? a.plannedAt).getTime());
  return (
    <Card>
      <CardHeader title="Protokoll" count={rows.length} hint="Quelle für den Monatsbericht" />
      {rows.length ? (
        <ul className="divide-y divide-[color:var(--border)] px-5 pb-4 text-sm">
          {rows.map((m) => (
            <li key={m.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-[color:var(--muted)]">{fmt(m.executedAt ?? m.decidedAt ?? m.plannedAt)}</span>
                <Badge tone={STATUS_TONE[m.status as MeasureStatus] ?? "neutral"}>{STATUS_LABEL[m.status as MeasureStatus] ?? m.status}</Badge>
                <Badge>{KIND_LABEL[m.kind as MeasureKind] ?? m.kind}</Badge>
                <span className="font-medium">{m.title}</span>
              </div>
              <p className="mt-0.5 text-[color:var(--muted)]">{m.reason}</p>
              <p className="mt-0.5 text-xs text-[color:var(--muted)]">
                {m.result ? `${m.result} · ` : ""}
                {m.decidedBy ? `entschieden von ${m.decidedBy}` : m.source === "manuell" ? "von Hand" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">Noch keine Maßnahme protokolliert.</p>
      )}
    </Card>
  );
}

export function AccountView({ detail, showBackLink = true }: { detail: Detail; showBackLink?: boolean }) {
  const a = detail.account;
  const open = detail.measures.filter((m) => m.status === "geplant" || m.status === "freigegeben").map(toView);
  return (
    <div className="space-y-5">
      {showBackLink ? (
        <AdminBack href="/admin/optimierung">Optimierung</AdminBack>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{a.label}</h1>
        <Badge>{a.kind === "pool" ? "Pay-per-Lead-Pool" : "Eigenes Werbekonto"}</Badge>
        <Badge tone={detail.autopilot ? "warning" : "neutral"}>{detail.autopilot ? "Autopilot" : "Vorschlag"}</Badge>
        {!a.active ? <Badge tone="danger">inaktiv</Badge> : null}
      </div>
      <p className="text-sm text-[color:var(--muted)]">
        {a.kind === "kunde" ? `Werbekonto act_${a.adAccountId}` : "Kampagnen des Produkts in den Agenturkonten"}
        {a.customer ? (
          <>
            {" · "}
            <Link className="underline" href={`/admin/kunden/${a.customer.id}`}>
              Kundenakte
            </Link>
          </>
        ) : null}
        {a.lastRunAt ? ` · letzter Lauf ${fmtTime(a.lastRunAt)}${a.lastRunNote ? `: ${a.lastRunNote}` : ""}` : " · noch kein Lauf"}
      </p>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Geplante Maßnahmen" count={open.length} hint={detail.autopilot ? "Autopilot: wird automatisch ausgeführt" : "Vorschlag: erst nach Freigabe"} />
            <PlannedList accountId={a.id} customerId={a.customerId} items={open} />
          </Card>
          <ProtocolCard measures={detail.measures} />
        </div>
        <div className="space-y-5">
          <Card id="lauf" className="scroll-mt-20">
            <CardHeader title="Lauf und Trockenlauf" hint="Trockenlauf: liest bei Meta nur und zeigt, was geplant würde" />
            <RunPanel accountId={a.id} customerId={a.customerId} />
          </Card>
          <Card>
            <CardHeader title="Maßnahme eintragen" hint="von Hand, landet im Protokoll" />
            <ManualForm accountId={a.id} customerId={a.customerId} />
          </Card>
          <Card>
            <CardHeader title="Einstellungen" />
            <div className="px-5 pb-5">
              <AccountSettingsForm
                accountId={a.id}
                customerId={a.customerId}
                kind={a.kind}
                autopilot={a.autopilot}
                globalAutopilot={detail.settings.autopilot}
                targetCpl={a.targetCpl}
                agreedDailyBudget={a.agreedDailyBudget}
                campaignKeyword={a.campaignKeyword}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Meta-Änderungsprotokoll" count={detail.activities.length} hint="letzte 30 Tage" />
            {detail.activities.length ? (
              <ul className="divide-y divide-[color:var(--border)] px-5 pb-4 text-sm">
                {detail.activities.map((x) => (
                  <li key={x.id} className="py-2">
                    <span className="tabular-nums text-[color:var(--muted)]">{fmtTime(x.eventTime)}</span> {activityLabel(x.eventType, x.translatedEventType)}
                    {x.objectName ? <span className="text-[color:var(--muted)]">: {x.objectName}</span> : null}
                    {x.actorName ? <span className="text-xs text-[color:var(--muted)]"> ({x.actorName})</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-sm text-[color:var(--muted)]">Noch nichts abgerufen (täglich automatisch).</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
