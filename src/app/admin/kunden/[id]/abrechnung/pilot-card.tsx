import { Badge, Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { pilotAbzeichen } from "@/lib/pilot";
import { savePilotAction } from "./pilot-actions";

const input = "h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm tabular-nums";
const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * Pilot (Ole, 20.11.2026): echter Kunde, kostenlos bis zu einem Tag. Statt Testkunde oder 0-€-Angebot. Zählt in allen
 * Kennzahlen; solange er läuft, rechnet die App keine Verkäufer-Plätze ab. Erinnerungen 7 Tage vorher und am letzten Tag.
 */
export async function PilotCard({ customerId, message, failed }: { customerId: string; message: string | null; failed: boolean }) {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { pilotBis: true, isTest: true, stripeCustomerId: true } });
  if (!c || c.isTest) return null;
  const abzeichen = pilotAbzeichen(c.pilotBis);
  return (
    <Card>
      <CardHeader title="Pilot" actions={abzeichen ? <Badge tone={abzeichen.laeuft ? "brand" : "warning"}>{abzeichen.text}</Badge> : null} />
      <div className="space-y-3 px-5 pb-5 pt-4 text-sm" id="pilot" data-admin-pilot>
        {message ? (
          <p className={`rounded-[var(--radius-sm)] px-3 py-2 font-medium ${failed ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>{message}</p>
        ) : null}
        <form action={savePilotAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="customerId" value={customerId} />
          <label className="grid gap-1 text-xs text-[color:var(--muted)]">
            Kostenlos bis einschließlich
            <input name="pilotBis" type="date" required defaultValue={ymd(c.pilotBis)} className={input} />
          </label>
          <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">Speichern</button>
          {c.pilotBis ? (
            <button name="entfernen" value="1" formNoValidate className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold">
              Pilot entfernen
            </button>
          ) : null}
        </form>
        <p className="text-xs text-[color:var(--muted)]">
          Echter Kunde, zählt in allen Zahlen. Bis dahin keine Abrechnung der Verkäufer-Plätze, Erinnerung 7 Tage vorher und am letzten Tag.
          {c.stripeCustomerId ? " Ein laufendes Stripe-Abo bleibt unverändert, bitte in Stripe prüfen." : ""}
        </p>
      </div>
    </Card>
  );
}
