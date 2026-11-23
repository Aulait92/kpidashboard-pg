import { Layers } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { productHistory } from "@/lib/produkt-buchen";
import { currentBudgets } from "@/lib/budget";
import { MANUAL_REASON_LABEL, STATUS_LABEL } from "@/lib/produkt-buchen-shared";
import { adminProduktAnlegenAction, decideProductAction } from "./produkt-actions";

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

/**
 * Kundenakte → Abrechnung: laufende Produkte (aus dem Angebot bzw. Werbebudget) und dazugebuchte mit Status und
 * Entscheidung. Ole, 21.11.2026: Produkte aus dem Angebot (z. B. Privatschutz bei Lohmann) standen nur beim
 * Werbebudget, die Karte wirkte, als sei nichts angelegt.
 */
export async function ProductBookingsCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const [rows, { lines }] = await Promise.all([productHistory(customerId), currentBudgets(customerId)]);
  const offen = new Set(rows.filter((r) => ["live", "setup", "requested"].includes(r.status)).map((r) => r.product.toLowerCase()));
  const laufend = lines.filter((l) => l.dailyBudget > 0 && !offen.has(l.product.toLowerCase()));
  return (
    <Card>
      <CardHeader title="Produkte" icon={Layers} hint="Laufend und dazugebucht" />
      <div className="space-y-4 p-5 text-sm" data-admin-produkte>
        {message ? <p className={failed ? "font-medium text-rose-700" : "font-medium text-emerald-700"}>{message}</p> : null}
        {laufend.length ? (
          <ul className="divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]" data-admin-produkte-laufend>
            {laufend.map((l) => (
              <li key={l.product} className="flex flex-wrap items-center gap-2 px-4 py-3">
                <span className="font-medium">{l.product}</span>
                <Badge tone="success">Läuft</Badge>
                <span className="text-[color:var(--muted)]">{eur0(l.dailyBudget)}/Tag · aus Angebot bzw. Werbebudget</span>
              </li>
            ))}
          </ul>
        ) : null}
        {rows.length === 0 ? (
          laufend.length ? null : <p className="text-[color:var(--muted)]">Noch keine Produkte. Kunden buchen unter Konto & Rechnungen → Produkte.</p>
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
        <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3" data-admin-produkt-anlegen>
          <summary className="cursor-pointer font-medium">Produkt hinzufügen (ohne Aufpreis)</summary>
          <form action={adminProduktAnlegenAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="customerId" value={customerId} />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--muted)]">Produkt</span>
              <input name="product" defaultValue="KFZ" required className="input h-9 w-40 text-sm" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--muted)]">Tagesbudget Meta (€)</span>
              <input name="dailyBudget" defaultValue="40" inputMode="decimal" required className="input h-9 w-28 text-sm" />
            </label>
            <button className="btn-primary h-9 text-sm">Hinzufügen</button>
          </form>
          <p className="mt-2 text-xs text-[color:var(--muted)]">Kein neuer Monatspreis, keine Einrichtung. Danach „Gestartet“ setzen, sobald die Kampagne läuft.</p>
        </details>
        <p className="text-xs text-[color:var(--muted)]">
          „Gestartet“ erst setzen, wenn Kampagne, Formular und Assistent laufen: Ab dann zählen Budget und Garantie, und der neue Monatspreis kommt ins Abo (ab dem nächsten
          Abrechnungsmonat). Beenden-Anfragen kommen als Aufgabe in „Heute“.
        </p>
      </div>
    </Card>
  );
}
