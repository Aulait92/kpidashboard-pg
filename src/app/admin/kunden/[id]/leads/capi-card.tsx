import { Badge, Card, CardHeader } from "@/components/ui";
import { loadCapiOverview } from "@/lib/capi/server";
import { shortError, STAGE_EVENT_NAME, STATUS_LABEL, type CapiStatus } from "@/lib/capi/shared";
import { CapiDatasetForm } from "./capi-dataset-form";

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

// Rückmeldung an Meta (Conversions API für CRM): Status je Kunde, Dataset überschreibbar (Ole, 15.11.2026).
export async function CapiCard({ customerId }: { customerId: string }) {
  const o = await loadCapiOverview(customerId);
  if (!o) return null;
  const rec = o.windows.d30.rec;
  const badge = o.isTest
    ? { tone: "neutral" as const, text: "Testkunde, sendet nicht" }
    : !o.enabled
      ? { tone: "neutral" as const, text: "vom Kunden aus" }
      : o.datasetId
        ? { tone: "success" as const, text: "aktiv" }
        : { tone: "warning" as const, text: "Dataset fehlt" };
  const counts = (Object.keys(o.counts7d) as CapiStatus[]).filter((k) => o.counts7d[k] > 0).map((k) => `${o.counts7d[k]} ${STATUS_LABEL[k]}`);
  return (
    <Card>
      <CardHeader title="Rückmeldung an Meta (CAPI)" actions={<Badge tone={badge.tone}>{badge.text}</Badge>} />
      <div className="space-y-3 px-5 pb-5 pt-3 text-sm">
        <p className="text-[color:var(--muted)]">
          Stufen der Meta-Leads (Lead, Erreicht, Termin vereinbart, Abschluss mit Jahresbeitrag) an das Dataset. Ohne Eingabe nehmen wir das erste
          Dataset des Werbekontos (act_…/adspixels). Der Systemnutzer braucht Zugriff auf das Dataset.
        </p>
        <CapiDatasetForm customerId={customerId} current={o.datasetSource === "admin" ? o.datasetId : null} />
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1" data-capi-admin>
          <dt className="text-[color:var(--muted)]">Dataset</dt>
          <dd>
            {o.datasetId ? `${o.datasetId} (${o.datasetSource === "admin" ? "von Hand" : "automatisch"})` : "noch keins"}
            {o.datasetError ? <span className="block text-rose-700">{shortError(o.datasetError)}</span> : null}
            {o.datasetCheckedAt ? <span className="block text-xs text-[color:var(--muted)]">zuletzt gesucht {fmt(o.datasetCheckedAt)}</span> : null}
          </dd>
          <dt className="text-[color:var(--muted)]">7 Tage</dt>
          <dd>{counts.length ? counts.join(", ") : "keine Ereignisse"}</dd>
          <dt className="text-[color:var(--muted)]">30 Tage</dt>
          <dd>
            {o.windows.d30.stats.leads} Meta-Leads, Ziel {rec.stage ? STAGE_EVENT_NAME[rec.stage] : "noch keins"}
            {rec.ready ? " (Kriterien erfüllt)" : ""}
          </dd>
        </dl>
        {o.lastErrors.length ? (
          <ul className="space-y-1 text-xs text-rose-700">
            {o.lastErrors.slice(0, 3).map((e, i) => (
              <li key={i}>
                {fmt(e.at)} {STAGE_EVENT_NAME[e.stage]}: {shortError(e.error, 160)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
