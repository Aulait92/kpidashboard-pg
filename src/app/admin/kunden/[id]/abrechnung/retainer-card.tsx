import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { kostenlosMoeglich } from "@/lib/abrechnungstag";
import { saveRetainerAction } from "./retainer-actions";
import { CHURN_OFFERS, churnReasonLabel, isChurnOffer, isHalteKind } from "@/lib/anti-churn";
import { HALTE_LABEL } from "@/lib/halteangebote";

const input = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm tabular-nums";
const dmy = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const ymd = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d) : "");

/** Betreuungsgebühr (Retainer) von Hand: Monatsbetrag netto, Start, optional Ende. */
export async function RetainerCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { retainerMonthly: true, retainerStart: true, retainerEnd: true, billingDay: true, billingStart: true, cancelRequestedAt: true, cancelEffectiveAt: true, cancelRequestedBy: true, cancelReason: true, onboarding: { select: { offerId: true } } },
  });
  if (!c) return null;
  const offer = c.onboarding?.offerId ? await prisma.offer.findFirst({ where: { id: c.onboarding.offerId, status: "accepted" }, select: { number: true, billingFreeStart: true } }) : null;
  const monthly = c.retainerMonthly != null ? Number(c.retainerMonthly) : null;
  // Anti-Churn: letzte Kündigungsabsichten (Grund, gewählte Alternative, Ergebnis)
  const intents = await prisma.churnIntent.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, reason: true, note: true, offer: true, outcome: true, createdAt: true } });
  // Halteangebote (lib/halteangebote-server.ts): angenommen, Stripe automatisch oder von Hand, später gekündigt
  const halte = await prisma.retentionOffer.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, kind: true, stripeStatus: true, stripeCouponId: true, commitUntil: true, cancelledLaterAt: true, createdAt: true } });
  return (
    <Card>
      <CardHeader title="Betreuungsgebühr" />
      <div className="space-y-3 px-5 pb-5 pt-4 text-sm" id="betreuungsgebuehr" data-admin-retainer>
        {message ? (
          <p className={`rounded-[var(--radius-sm)] px-3 py-2 font-medium ${failed ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{message}</p>
        ) : null}
        {c.cancelRequestedAt && c.cancelEffectiveAt ? (
          <p className="rounded-[var(--radius-sm)] bg-amber-50 px-3 py-2 text-amber-900" data-admin-kuendigung>
            <b>Vom Kunden gekündigt</b> am {dmy(c.cancelRequestedAt)} ({c.cancelRequestedBy ?? "unbekannt"}) zum <b>{dmy(c.cancelEffectiveAt)}</b>
            {c.cancelReason ? `. Grund: ${c.cancelReason}` : ""}. Das Ende trägt der Cron am Tag nach dem Vertragsende ein (Konto ruht). Das Stripe-Abo endet automatisch zum Termin, außer die Aufgabe sagt „Stripe bitte von Hand prüfen“.
          </p>
        ) : null}
        {intents.length ? (
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2" data-admin-churn>
            <div className="mb-1 font-medium">Kündigungsabsichten</div>
            <ul className="space-y-1">
              {intents.map((i) => (
                <li key={i.id}>
                  {dmy(i.createdAt)}: {churnReasonLabel(i.reason)}
                  {i.note ? ` („${i.note}“)` : ""}
                  {i.offer && isChurnOffer(i.offer) ? `, gewählt: ${CHURN_OFFERS[i.offer].title}` : ""}
                  {i.outcome === "gekuendigt" ? ", danach gekündigt" : i.outcome === "alternative" ? ", geblieben" : ", noch offen"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {halte.length ? (
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2" data-admin-halteangebote>
            <div className="mb-1 font-medium">Halteangebote</div>
            <ul className="space-y-1">
              {halte.map((h) => (
                <li key={h.id}>
                  {dmy(h.createdAt)}: {isHalteKind(h.kind) ? HALTE_LABEL[h.kind] : h.kind}
                  {h.stripeStatus === "applied" ? `, Stripe automatisch${h.stripeCouponId ? ` (${h.stripeCouponId})` : ""}` : h.stripeStatus === "manual" ? ", Stripe bzw. Gutschrift von Hand (Aufgabe)" : ""}
                  {h.commitUntil ? `, Mindestlaufzeit bis ${dmy(new Date(h.commitUntil.getTime() - 1))}` : ""}
                  {h.cancelledLaterAt ? `, trotzdem gekündigt am ${dmy(h.cancelledLaterAt)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-[color:var(--muted)]">
          {offer
            ? `Kommt aus Angebot ${offer.number}. Hier nur ändern, wenn sich der Vertrag geändert hat.`
            : "Für Kunden ohne Online-Angebot. Zählt auf der Zahlen-Seite als Betreuung und in den Lead-Kosten des Kunden. Stripe bleibt unverändert."}
        </p>
        <p data-admin-abrechnungstag>
          <span className="text-[color:var(--muted)]">Abrechnungstag: </span>
          {c.billingDay != null
            ? `jeweils am ${c.billingDay}.${c.billingStart ? `, erste Abbuchung ${dmy(c.billingStart)}` : ""}${
                c.billingStart && c.retainerStart && ymd(c.billingStart) !== ymd(c.retainerStart)
                  ? offer?.billingFreeStart && kostenlosMoeglich(ymd(c.retainerStart), ymd(c.billingStart))
                    ? `, kostenloser Start ab ${dmy(c.retainerStart)}`
                    : `, ${dmy(c.retainerStart)} bis davor anteilig`
                  : ""
              }`
            : c.retainerStart
              ? `wie Start (am ${Number(ymd(c.retainerStart).slice(8, 10))}.)`
              : "wie Start"}
        </p>
        <form action={saveRetainerAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="customerId" value={customerId} />
          <label className="grid gap-1 text-xs text-[color:var(--muted)]">
            Monatsbetrag netto (€)
            <input name="monthly" inputMode="decimal" placeholder="z. B. 990" defaultValue={monthly != null ? String(monthly).replace(".", ",") : ""} className={`${input} w-32`} />
          </label>
          <label className="grid gap-1 text-xs text-[color:var(--muted)]">
            Start
            <input name="start" type="date" defaultValue={ymd(c.retainerStart)} className={input} />
          </label>
          <label className="grid gap-1 text-xs text-[color:var(--muted)]">
            Ende (optional)
            <input name="end" type="date" defaultValue={ymd(c.retainerEnd ?? c.cancelEffectiveAt)} className={input} />
          </label>
          <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">Speichern</button>
        </form>
        <p className="text-xs text-[color:var(--muted)]">Betrag leer lassen und speichern entfernt die Betreuungsgebühr.</p>
      </div>
    </Card>
  );
}
