import { redirect } from "next/navigation";
import { CreditCard, Package } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { fmtWeek, monthRange, weekRange } from "@/lib/ppl/periods";
import { openCredits } from "@/lib/ppl/storno";
import { MIN_ORDER } from "@/lib/ppl/orders";
import { bruttoJeLead, effektiveSteuer, isSteuer, STEUERFREI_PREISHINWEIS, type Steuer } from "@/lib/ppl/steuer";
import { OrderForm } from "./order-form";
import { paymentSetupAction, toggleAutoRenewAction } from "./actions";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bestellen | performancegrowth" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
// Bruttopreise anzeigen (Ole, 19.11.2026); gespeichert wird netto, Stripe rechnet die USt. dazu. Steuerfreie Leads
// (§ 4 Nr. 11 UStG, Ole 20.11.2026): brutto = netto, mit Hinweis.
const brutto = (netto: number, steuer: Steuer) => eur(bruttoJeLead(netto, steuer));
const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "bezahlt", tone: "success" },
  processing: { label: "Lastschrift läuft", tone: "success" },
  open: { label: "Zahlung offen", tone: "warning" },
  failed: { label: "Zahlung fehlgeschlagen", tone: "danger" },
  cancelled: { label: "storniert", tone: "neutral" },
  wartet: { label: "wird vorbereitet", tone: "warning" },
};

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ zahlung?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const { zahlung } = await searchParams;
  const [subs, customer] = await Promise.all([
    prisma.leadSubscription.findMany({ where: { customerId: ctx.customerId, active: true, delivery: { in: ["app", "app_pdf"] } }, orderBy: { createdAt: "asc" } }),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { stripeCustomerId: true, vermittlerRegisterNr: true, vermittlerRegisterStatus: true, vermittlerGeprueftAt: true } }),
  ]);
  if (!subs.length) redirect("/buyer");
  const { hasPaymentMethod, billingEnabled } = await import("@/lib/billing");
  const hasPm = billingEnabled() ? await hasPaymentMethod(customer?.stripeCustomerId ?? null).catch(() => false) : false;
  const now = new Date();
  const thisWeek = weekRange(now);
  const nextWeek = weekRange(now, 1);

  const cards = await Promise.all(
    subs.map(async (s) => {
      const [current, next, credits] = await Promise.all([
        prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: thisWeek.start } } }),
        prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: s.id, periodStart: nextWeek.start } } }),
        openCredits(s.id),
      ]);
      const range = s.period === "week" ? thisWeek : s.period === "month" ? monthRange(now) : { start: s.startDate ?? new Date(0), end: new Date(8.64e15) };
      const where = s.period === "week" ? { orderId: current?.id ?? "-" } : { subscriptionId: s.id, deliveredAt: { gte: range.start, lt: range.end } };
      const [delivered, stornos] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.count({ where: { ...where, stornoState: { in: ["approved", "review"] } } }),
      ]);
      const quota = s.period === "week" ? (current?.quantity ?? 0) : (s.goal ?? s.testQuantity ?? 0);
      return { s, current, next, credits, delivered, stornos, quota };
    }),
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/wachstum" title="Leads bestellen" subtitle="Exklusive Leads, im Voraus bezahlt. Geliefert wird sofort nach Eingang." />
      <div className="space-y-5">
        {zahlung === "ok" ? (
          <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Zahlungsart ist hinterlegt. Jetzt können Sie bestellen.</div>
        ) : null}
        {!hasPm ? (
          <Card>
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
                <p className="min-w-0 flex-1 text-sm">Für Bestellungen brauchen wir einmalig eine Zahlungsart.</p>
              </div>
              <form action={paymentSetupAction} className="max-w-md space-y-4">
                <ZahlartAuswahl hint="Am einfachsten per Lastschrift, der Betrag wird je Bestellung automatisch eingezogen." />
                <Button type="submit" variant="primary" size="md">Zahlungsart hinterlegen</Button>
              </form>
            </div>
          </Card>
        ) : null}

        {cards.map(({ s, current, next, credits, delivered, stornos, quota }) => {
          const pct = quota ? Math.min(100, Math.round((delivered / quota) * 100)) : 0;
          const price = Number(s.price);
          const steuer = effektiveSteuer(s, customer).steuer;
          const frei = steuer === "steuerfrei_4_11";
          return (
            <Card key={s.id}>
              <CardHeader
                title={s.label ?? s.productKey}
                icon={Package}
                actions={
                  <span className="text-right text-sm text-[color:var(--muted)]">
                    {brutto(price, steuer)} je Lead
                    {frei ? <span className="block text-xs">{STEUERFREI_PREISHINWEIS}</span> : null}
                  </span>
                }
              />
              <div className="space-y-4 px-5 pb-5 text-sm">
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">
                      {s.period === "week" ? `Diese Woche (${fmtWeek(thisWeek.start)})` : s.period === "month" ? "Dieser Monat" : "Kontingent"}
                    </span>
                    {current ? <Badge tone={STATUS[current.status]?.tone ?? "neutral"}>{STATUS[current.status]?.label ?? current.status}</Badge> : null}
                  </div>
                  {quota ? (
                    <>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken,#f1f5f9)]">
                        <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1.5 text-[color:var(--muted)]">
                        <b className="text-[color:var(--foreground)]">{delivered} von {quota}</b> geliefert{stornos ? ` · ${stornos} storniert` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-[color:var(--muted)]">Für diese Woche ist nichts bestellt.</p>
                  )}
                </div>

                {credits.amount > 0 ? (
                  <p className="rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 text-emerald-900">
                    Gutschrift {brutto(credits.amount, steuer)} aus {credits.leadIds.length} Storno(s) wird mit der nächsten Bestellung verrechnet.
                  </p>
                ) : null}

                {s.period === "week" ? (
                  <div className="border-t border-[color:var(--border)] pt-4">
                    {[current, next].find((o) => o?.status === "wartet") ? (
                      // Erste Woche aus dem Angebot (lib/ppl/erste-woche.ts): wartet auf Registerprüfung bzw. Zahlungsart
                      <p className="text-[color:var(--muted)]" data-erste-woche-wartet>
                        <b className="text-[color:var(--foreground)]">{[current, next].find((o) => o?.status === "wartet")!.quantity} Leads vorgemerkt.</b>{" "}
                        {hasPm ? "Wir prüfen kurz Ihre Registernummer, dann buchen wir ab und die Lieferung startet." : "Bitte hinterlegen Sie oben eine Zahlungsart. Danach prüfen wir kurz Ihre Registernummer und die Lieferung startet."}
                      </p>
                    ) : next && ["paid", "processing"].includes(next.status) ? (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-medium">Nächste Woche ({fmtWeek(nextWeek.start)})</div>
                          <div className="text-[color:var(--muted)]">
                            {next.quantity} Leads bestellt · {brutto(Number(next.amount), isSteuer(next.steuer) ? next.steuer : "steuerpflichtig")} · {STATUS[next.status]?.label}
                          </div>
                        </div>
                        <form action={toggleAutoRenewAction}>
                          <input type="hidden" name="orderId" value={next.id} />
                          <button className="inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--brand)] hover:underline">
                            {next.autoRenew ? "Automatische Verlängerung beenden" : "Jede Woche wiederholen"}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <OrderForm
                        subscriptionId={s.id}
                        price={price}
                        steuer={steuer}
                        credit={credits.amount}
                        min={MIN_ORDER}
                        defaultQty={current?.quantity ?? next?.quantity ?? 20}
                        canOrderThisWeek={!current || !["paid", "processing"].includes(current.status)}
                        weekLabels={{ this: fmtWeek(thisWeek.start), next: fmtWeek(nextWeek.start) }}
                        disabled={!hasPm || ctx.preview}
                      />
                    )}
                    {current?.autoRenew && !next && ["paid", "processing"].includes(current.status) ? (
                      <p className="mt-3 text-xs text-[color:var(--muted)]">
                        Wird am Freitag automatisch mit {current.quantity} Leads für nächste Woche verlängert, wenn Sie nichts ändern.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
        <p className="text-xs text-[color:var(--muted)]">
          Storno: innerhalb der vereinbarten Frist im Lead unter „Mehr“ → „Stornieren“ mit Grund. Stornierte Leads werden ersatzlos gutgeschrieben.
        </p>
      </div>
    </main>
  );
}
