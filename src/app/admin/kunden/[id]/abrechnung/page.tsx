import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Badge, Card, CardHeader } from "@/components/ui";
import { AdminPauseCard } from "@/components/vertrieb/onboarding-card";
import { billingEnabled, listCustomerInvoices, type CustomerInvoice } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { currentPause, todayBerlin } from "@/lib/pause";
import { prisma } from "@/lib/prisma";

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "Bezahlt", tone: "success" },
  open: { label: "Offen", tone: "warning" },
  uncollectible: { label: "Nicht einziehbar", tone: "danger" },
  void: { label: "Storniert", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

// Reiter „Abrechnung & Pause“.
export default async function KundenAbrechnung({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pause?: string }> }) {
  await connection();
  const { id } = await params;
  const { pause: pauseError } = await searchParams;
  const c = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, stripeCustomerId: true, paymentOverdueSince: true, paymentWarnedAt: true, salesContact: { select: { id: true } } },
  });
  if (!c) notFound();
  let invoices: CustomerInvoice[] = [];
  if (c.stripeCustomerId && billingEnabled()) {
    invoices = await listCustomerInvoices(c.stripeCustomerId).catch((err) => {
      reportError(err, "admin-invoices", { customer: id });
      return [];
    });
  }
  const pause = await currentPause(id);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-5">
        {c.paymentOverdueSince ? (
          <div className="rounded-[var(--radius-lg)] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
            <b>Zahlung offen seit {fmt(c.paymentOverdueSince)}.</b>{" "}
            {c.paymentWarnedAt ? `Warnung verschickt am ${fmt(c.paymentWarnedAt)}. ` : ""}
            Nach 30 Tagen werden die Anzeigen automatisch pausiert.
          </div>
        ) : null}
        <AdminPauseCard customerId={id} contactId={c.salesContact?.id ?? ""} pause={pause} error={pauseError ?? null} today={todayBerlin()} />
      </div>

      <Card>
        <CardHeader
          title="Rechnungen"
          count={invoices.length || undefined}
          actions={
            c.stripeCustomerId ? (
              <a
                href={`https://dashboard.stripe.com/customers/${c.stripeCustomerId}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[color:var(--brand)] hover:underline"
              >
                In Stripe öffnen ↗
              </a>
            ) : null
          }
        />
        {invoices.length === 0 ? (
          <p className="p-5 text-sm text-[color:var(--muted)]">
            {c.stripeCustomerId ? "Noch keine Rechnungen." : "Keine Online-Zahlung hinterlegt (Abrechnung von Hand)."}
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {invoices.map((inv) => {
              const st = STATUS[inv.status ?? ""] ?? { label: inv.status ?? "", tone: "neutral" as const };
              return (
                <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                  <span className="font-medium">{inv.number ?? "Rechnung"}</span>
                  <span className="text-[color:var(--muted)]">{fmt(inv.created)}</span>
                  <span className="tabular-nums">{eur(inv.total)}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {inv.pdfUrl ? (
                    <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-[color:var(--brand)] hover:underline">
                      PDF
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
