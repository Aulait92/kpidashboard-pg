import { TrendingUp } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { budgetHistory, currentBudgets } from "@/lib/budget";
import { decideBudgetAction } from "./budget-actions";

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }> = {
  applied: { label: "Übernommen", tone: "success" },
  pending: { label: "Anfrage offen", tone: "warning" },
  rejected: { label: "Abgelehnt", tone: "neutral" },
};
const STRIPE: Record<string, string> = {
  none: "",
  scheduled: "Preis wird zum Startdatum im Abo angepasst",
  processing: "Preis wird angepasst …",
  done: "Preis im Abo angepasst",
  manual: "Preis von Hand prüfen (Aufgabe in Heute)",
  error: "Preis-Anpassung fehlgeschlagen (Aufgabe in Heute)",
};

/** Kundenakte → Abrechnung: aktuelles Werbebudget, Historie, offene Anfragen. */
export async function BudgetHistoryCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const [{ lines, upcoming }, rows] = await Promise.all([currentBudgets(customerId), budgetHistory(customerId)]);
  return (
    <Card>
      <CardHeader title="Werbebudget" icon={TrendingUp} hint="Änderungen durch den Kunden" />
      <div className="space-y-4 p-5 text-sm" data-admin-budget>
        {message ? <p className={failed ? "font-medium text-rose-700" : "font-medium text-emerald-700"}>{message}</p> : null}
        {lines.length ? (
          <p>
            <span className="text-[color:var(--muted)]">Aktuell: </span>
            {lines.map((l) => `${l.product} ${eur0(l.dailyBudget)}/Tag`).join(" · ")}
            {upcoming.length ? <span className="text-[color:var(--muted)]"> · geplant: {upcoming.map((u) => `${u.product} ${eur0(u.dailyBudget)}/Tag ab ${fmt(u.validFrom)}`).join(", ")}</span> : null}
          </p>
        ) : (
          <p className="text-[color:var(--muted)]">Kein Budget aus einem Angebot hinterlegt.</p>
        )}
        {rows.length === 0 ? (
          <p className="text-[color:var(--muted)]">Noch keine Änderungen.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
            {rows.map((r) => {
              const st = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const };
              return (
                <li key={r.id} className="space-y-1.5 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{fmt(r.createdAt)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {r.tierChange ? <Badge tone="info">Stufenwechsel</Badge> : null}
                    <span className="text-[color:var(--muted)]">gültig ab {fmt(r.effectiveFrom)}</span>
                  </div>
                  <div>{r.changes.map((c) => `${c.product}: ${eur0(c.from)} → ${eur0(c.to)}/Tag`).join(" · ")}</div>
                  <div className="text-[color:var(--muted)]">
                    {eur0(r.monthlyBudgetFrom)} → {eur0(r.monthlyBudgetTo)} Werbebudget/Monat
                    {r.feeFrom != null && r.feeTo != null && r.feeFrom !== r.feeTo ? ` · Betreuung ${eur0(r.feeFrom)} → ${eur0(r.feeTo)} netto/Monat` : ""}
                    {r.reasonLabel ? ` · ${r.reasonLabel}` : ""}
                    {STRIPE[r.stripeStatus] ? ` · ${STRIPE[r.stripeStatus]}` : ""}
                    {r.stripeNote ? ` (${r.stripeNote})` : ""}
                  </div>
                  {r.note ? <div className="text-[color:var(--muted)]">Notiz: {r.note}</div> : null}
                  {r.status === "pending" ? (
                    <form action={decideBudgetAction} className="flex flex-wrap items-center gap-2 pt-1">
                      <input type="hidden" name="customerId" value={customerId} />
                      <input type="hidden" name="changeId" value={r.id} />
                      <input name="note" placeholder="Notiz an den Kunden (optional)" className="input h-9 min-w-0 flex-1 text-sm" />
                      <button name="decision" value="accept" className="btn-primary h-9 text-sm">Übernehmen</button>
                      <button name="decision" value="reject" className="btn-ghost h-9 text-sm">Ablehnen</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
