import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { churnReasonLabel } from "@/lib/anti-churn";
import { LIFECYCLE_LABEL, lifecycleState, type LifecycleKind } from "@/lib/ruhend-shared";

const dmy = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const RETENTION: Record<string, string> = { "24m": "24 Monate", "3m": "3 Monate", sofort: "sofort nach Vertragsende" };

/** Kundenakte → Abrechnung: gekündigt am, ruht seit/bis, reaktiviert am, gelöscht am (lib/ruhend.ts). */
export async function LebenszyklusCard({ customerId }: { customerId: string }) {
  const [c, events] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: { cancelRequestedAt: true, cancelEffectiveAt: true, dormantSince: true, dataDeletedAt: true, retentionChoice: true, deleteAfter: true, retentionReminder30At: true, retentionReminder7At: true },
    }),
    prisma.customerLifecycleEvent.findMany({ where: { customerId }, orderBy: [{ at: "asc" }, { createdAt: "asc" }], select: { id: true, kind: true, at: true, mrr: true, reason: true, churnReason: true, details: true } }),
  ]);
  if (!c || (!events.length && !c.cancelEffectiveAt)) return null;
  const state = lifecycleState(c);
  const lastReactivation = [...events].reverse().find((e) => e.kind === "reactivated");
  return (
    <Card>
      <CardHeader title="Kündigung & Rückkehr" />
      <div className="space-y-3 px-5 pb-5 pt-2 text-sm" data-admin-lebenszyklus-kunde>
        {state === "ruhend" ? (
          <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-amber-900">
            <b>Konto ruht</b> seit {dmy(c.dormantSince!)}
            {c.deleteAfter ? `, Löschung am ${dmy(c.deleteAfter)}` : ""} (Aufbewahrung {RETENTION[c.retentionChoice ?? ""] ?? "24 Monate"}). Kein Zugang außer Export
            und „Konto reaktivieren“, keine Verarbeitung.
            {c.retentionReminder7At ? ` Erinnerung 7 Tage vorher am ${dmy(c.retentionReminder7At)}.` : c.retentionReminder30At ? ` Erinnerung 30 Tage vorher am ${dmy(c.retentionReminder30At)}.` : ""}
          </p>
        ) : state === "gekuendigt" ? (
          <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-amber-900">
            Gekündigt zum <b>{dmy(c.cancelEffectiveAt!)}</b>. Danach ruht das Konto, Löschung {c.deleteAfter ? `am ${dmy(c.deleteAfter)}` : "nach der Aufbewahrung"} (
            {RETENTION[c.retentionChoice ?? ""] ?? "24 Monate"}).
          </p>
        ) : state === "geloescht" ? (
          <p className="rounded-[var(--radius-sm)] bg-rose-50 px-3 py-2 text-rose-900">Daten endgültig gelöscht am {dmy(c.dataDeletedAt!)}. Abrechnungsdaten und Kennzahlen bleiben.</p>
        ) : lastReactivation ? (
          <p className="rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 text-emerald-900">
            <b>Reaktiviert</b> am {dmy(lastReactivation.at)}. Abrechnung neu starten: Betreuungsgebühr unten ohne Ende eintragen (bzw. neues Angebot), Kampagnen wieder an.
          </p>
        ) : null}
        {events.length ? (
          <ol className="space-y-1">
            {events.map((e) => {
              const d = (e.details ?? {}) as { contractEnd?: string; retention?: string; dormantDays?: number };
              return (
                <li key={e.id}>
                  <span className="tabular-nums text-[color:var(--muted)]">{dmy(e.at)}</span> · <b>{LIFECYCLE_LABEL[e.kind as LifecycleKind] ?? e.kind}</b>
                  {e.mrr != null && Number(e.mrr) > 0 ? ` · ${eur(Number(e.mrr))}/Monat` : ""}
                  {e.kind === "cancelled" && d.contractEnd ? ` · zum ${d.contractEnd.split("-").reverse().join(".")}` : ""}
                  {e.kind === "cancelled" || e.kind === "reactivated" ? (e.churnReason ? ` · ${churnReasonLabel(e.churnReason)}` : "") : ""}
                  {e.kind === "cancelled" && d.retention ? ` · Aufbewahrung ${RETENTION[d.retention] ?? d.retention}` : ""}
                  {e.kind === "reactivated" && d.dormantDays != null ? ` · ruhte ${d.dormantDays} Tage` : ""}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </Card>
  );
}
