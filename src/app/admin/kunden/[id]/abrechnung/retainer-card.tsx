import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { saveRetainerAction } from "./retainer-actions";

const input = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm tabular-nums";
const ymd = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d) : "");

/** Betreuungsgebühr (Retainer) von Hand: Monatsbetrag netto, Start, optional Ende. */
export async function RetainerCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { retainerMonthly: true, retainerStart: true, retainerEnd: true, onboarding: { select: { offerId: true } } },
  });
  if (!c) return null;
  const offer = c.onboarding?.offerId ? await prisma.offer.findFirst({ where: { id: c.onboarding.offerId, status: "accepted" }, select: { number: true } }) : null;
  const monthly = c.retainerMonthly != null ? Number(c.retainerMonthly) : null;
  return (
    <Card>
      <CardHeader title="Betreuungsgebühr" />
      <div className="space-y-3 px-5 pb-5 pt-4 text-sm" id="betreuungsgebuehr" data-admin-retainer>
        {message ? (
          <p className={`rounded-[var(--radius-sm)] px-3 py-2 font-medium ${failed ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{message}</p>
        ) : null}
        <p className="text-[color:var(--muted)]">
          {offer
            ? `Kommt aus Angebot ${offer.number}. Hier nur ändern, wenn sich der Vertrag geändert hat.`
            : "Für Kunden ohne Online-Angebot. Zählt auf der Zahlen-Seite als Betreuung und in den Lead-Kosten des Kunden. Stripe bleibt unverändert."}
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
            <input name="end" type="date" defaultValue={ymd(c.retainerEnd)} className={input} />
          </label>
          <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">Speichern</button>
        </form>
        <p className="text-xs text-[color:var(--muted)]">Betrag leer lassen und speichern entfernt die Betreuungsgebühr.</p>
      </div>
    </Card>
  );
}
