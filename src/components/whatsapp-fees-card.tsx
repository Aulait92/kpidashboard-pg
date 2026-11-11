import { MessageCircle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { berlinMonth, CATEGORY_LABEL, FEE_CATEGORIES, feeUsage, type FeeCategory } from "@/lib/whatsapp/fees";

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
};

/** WhatsApp-Gebühren von Meta: laufender Monat und bisherige Abrechnungen. */
export async function WhatsAppFeesCard({ customerId, admin = false }: { customerId: string; admin?: boolean }) {
  const month = berlinMonth();
  const [usage, charges] = await Promise.all([
    feeUsage(customerId, month),
    prisma.whatsAppFeeCharge.findMany({ where: { customerId }, orderBy: { month: "desc" }, take: 6 }),
  ]);
  const parts = FEE_CATEGORIES.filter((k) => usage.counts[k] > 0);
  return (
    <Card>
      <CardHeader title="WhatsApp-Gebühren (Meta)" icon={MessageCircle} />
      <div className="space-y-3 px-5 pb-5 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[color:var(--muted)]">{monthLabel(month)} bisher</span>
          <span className="text-lg font-semibold tabular-nums">{eur(usage.amount)}</span>
        </div>
        {parts.length ? (
          <ul className="space-y-1 text-[color:var(--muted)]">
            {parts.map((k) => (
              <li key={k} className="flex justify-between">
                <span>{CATEGORY_LABEL[k as FeeCategory]}</span>
                <span className="tabular-nums">{usage.counts[k]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[color:var(--muted)]">Noch keine berechneten Nachrichten in diesem Monat.</p>
        )}
        <p className="text-xs text-[color:var(--muted)]">
          Meta berechnet vor allem Vorlagen-Nachrichten (z. B. die erste Nachricht an einen neuen Lead). Antworten innerhalb eines laufenden
          Gesprächs sind meist kostenlos.{" "}
          {PRICE_LIST.whatsappIncluded
            ? "Die Gebühren sind im Preis enthalten und werden nicht weiterberechnet. Wir erfassen sie nur intern (Kosten auf der Zahlen-Seite)."
            : "Wir berechnen genau das weiter, was Meta berechnet, auf der Rechnung des Folgemonats."}
        </p>
        {charges.length ? (
          <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
            {charges.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span>{monthLabel(c.month)}</span>
                <span className="tabular-nums">
                  {eur(Number(c.amount))}
                  {admin ? <span className="ml-2 text-xs text-[color:var(--muted)]">{c.stripeInvoiceItemId ? "in Stripe" : "von Hand abrechnen"}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
