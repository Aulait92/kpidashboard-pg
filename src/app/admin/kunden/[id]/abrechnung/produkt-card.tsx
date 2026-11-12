import { Layers } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { productHistory } from "@/lib/produkt-buchen";
import { MANUAL_REASON_LABEL, STATUS_LABEL } from "@/lib/produkt-buchen-shared";
import { decideProductAction } from "./produkt-actions";

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;

const TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "info"> = {
  requested: "info",
  setup: "warning",
  live: "success",
  rejected: "neutral",
  ended: "neutral",
};
const SETUP: Record<string, string> = {
  none: "",
  added: "Einrichtung auf nächster Rechnung",
  manual: "Einrichtung von Hand berechnen",
  removed: "Einrichtung zurückgenommen",
  error: "Einrichtung: Stripe-Fehler",
};
const FEE: Record<string, string> = {
  none: "",
  pending: "Monatspreis kommt beim Start ins Abo",
  done: "Monatspreis im Abo angepasst",
  manual: "Monatspreis von Hand (Aufgabe in Heute)",
  error: "Monatspreis: Stripe-Fehler (Aufgabe in Heute)",
};

/** Kundenakte → Abrechnung: selbst gebuchte Produkte mit Status und Entscheidung. */
export async function ProductBookingsCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const rows = await productHistory(customerId);
  return (
    <Card>
      <CardHeader title="Produkte" icon={Layers} hint="Vom Kunden dazugebucht" />
      <div className="space-y-4 p-5 text-sm" data-admin-produkte>
        {message ? <p className={failed ? "font-medium text-rose-700" : "font-medium text-emerald-700"}>{message}</p> : null}
        {rows.length === 0 ? (
          <p className="text-[color:var(--muted)]">Noch keine Produktbuchungen. Kunden buchen unter Konto & Rechnungen → Produkte.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1.5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.product}</span>
                  <Badge tone={TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {r.catalogKey === "angebot" ? <Badge tone="neutral">aus Angebot</Badge> : null}
                  {r.tierChange ? <Badge tone="info">Stufenwechsel</Badge> : null}
                  {r.endRequestedAt ? <Badge tone="danger">Beenden angefragt {fmt(r.endRequestedAt)}</Badge> : null}
                </div>
                <div className="text-[color:var(--muted)]">
                  gebucht {fmt(r.createdAt)} · {eur0(r.dailyBudget)}/Tag
                  {r.startWish ? ` · Start gewünscht ${fmt(r.startWish)}` : r.catalogKey !== "angebot" ? " · Start so bald wie möglich" : ""}
                  {r.startedAt ? ` · gestartet ${fmt(r.startedAt)}` : ""}
                </div>
                {r.catalogKey !== "angebot" ? (
                  <div className="text-[color:var(--muted)]">
                    {eur0(r.monthlyBudgetFrom)} → {eur0(r.monthlyBudgetTo)} Werbebudget/Monat · Einrichtung {eur0(r.setupFee)}
                    {r.feeFrom != null && r.feeTo != null ? ` · Betreuung ${eur0(r.feeFrom)} → ${eur0(r.feeTo)} netto/Monat` : ""}
                    {r.reason && r.reason in MANUAL_REASON_LABEL ? ` · ${MANUAL_REASON_LABEL[r.reason as keyof typeof MANUAL_REASON_LABEL]}` : r.reason === "individual_budget" ? " · über Listenpreis" : ""}
                    {SETUP[r.setupStatus] ? ` · ${SETUP[r.setupStatus]}` : ""}
                    {FEE[r.feeStatus] ? ` · ${FEE[r.feeStatus]}` : ""}
                    {r.stripeNote ? ` (${r.stripeNote})` : ""}
                  </div>
                ) : null}
                {r.note ? <div className="text-[color:var(--muted)]">Notiz: {r.note}</div> : null}
                {r.status === "setup" || r.status === "requested" ? (
                  <form action={decideProductAction} className="flex flex-wrap items-center gap-2 pt-1">
                    <input type="hidden" name="customerId" value={customerId} />
                    <input type="hidden" name="bookingId" value={r.id} />
                    <input name="note" placeholder="Notiz an den Kunden (optional)" className="input h-9 min-w-0 flex-1 text-sm" />
                    {r.status === "setup" ? (
                      <button name="decision" value="start" className="btn-primary h-9 text-sm">
                        Gestartet
                      </button>
                    ) : (
                      <button name="decision" value="accept" className="btn-primary h-9 text-sm">
                        Übernehmen
                      </button>
                    )}
                    <button name="decision" value="reject" className="btn-ghost h-9 text-sm">
                      Ablehnen
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[color:var(--muted)]">
          „Gestartet“ erst setzen, wenn Kampagne, Formular und Assistent laufen: Ab dann zählen Budget und Garantie, und der neue Monatspreis kommt ins Abo (ab dem nächsten
          Abrechnungsmonat). Beenden-Anfragen kommen als Aufgabe in „Heute“.
        </p>
      </div>
    </Card>
  );
}
