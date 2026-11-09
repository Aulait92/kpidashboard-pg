import { redirect } from "next/navigation";
import { Bell, CreditCard, FileText, Package } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { billingEnabled, listCustomerInvoices, type CustomerInvoice } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { openPortalAction } from "./actions";
import { LeadEmailToggle, PauseCard } from "./pause-card";
import { currentPause, todayBerlin } from "@/lib/pause";

export const dynamic = "force-dynamic";
export const metadata = { title: "Konto & Rechnungen | performancegrowth" };

const TZ = "Europe/Berlin";
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "Bezahlt", tone: "success" },
  open: { label: "Offen", tone: "warning" },
  uncollectible: { label: "Nicht einziehbar", tone: "danger" },
  void: { label: "Storniert", tone: "neutral" },
};

const PORTAL_MSG: Record<string, string> = {
  vorschau: "In der Vorschau nicht möglich.",
  fehlt: "Für Ihr Konto ist noch keine Online-Zahlung hinterlegt. Bitte melden Sie sich kurz bei uns.",
  fehler: "Das hat gerade nicht geklappt. Bitte versuchen Sie es gleich noch einmal.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ portal?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { portal } = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: {
      name: true,
      plan: true,
      retainerMonthly: true,
      retainerStart: true,
      stripeCustomerId: true,
      leadEmail: true,
      onboarding: { select: { offerId: true, questionnaire: true } },
    },
  });
  if (!customer) redirect("/buyer");
  const offer = customer.onboarding?.offerId
    ? await prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { term: true, softwareFee: true, number: true, token: true } })
    : null;

  let invoices: CustomerInvoice[] = [];
  if (customer.stripeCustomerId && billingEnabled()) {
    invoices = await listCustomerInvoices(customer.stripeCustomerId).catch((err) => {
      reportError(err, "billing-invoices", { customer: ctx.customerId });
      return [];
    });
  }
  const monthly = customer.retainerMonthly != null ? Number(customer.retainerMonthly) : null;
  const pause = await currentPause(ctx.customerId);
  const today = todayBerlin();
  const startYmd = customer.retainerStart ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(customer.retainerStart) : today;
  const softwareFee = offer ? Number(offer.softwareFee) : customer.plan === "service" ? 0 : 349;
  const service = customer.plan === "service";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Konto & Rechnungen" subtitle={customer.name} />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Ihr Vertrag" icon={Package} />
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 p-5 text-[15px]">
            <dt className="text-[color:var(--muted)]">Paket</dt>
            <dd>{service ? "Leadgenerierung (Betreuung)" : "Leadgenerierung + Software"}</dd>
            {monthly != null ? (
              <>
                <dt className="text-[color:var(--muted)]">Monatlich</dt>
                <dd>{eur(monthly)} netto zzgl. USt.</dd>
              </>
            ) : null}
            {customer.retainerStart ? (
              <>
                <dt className="text-[color:var(--muted)]">Start</dt>
                <dd>{date(customer.retainerStart)}</dd>
              </>
            ) : null}
            {offer ? (
              <>
                <dt className="text-[color:var(--muted)]">Laufzeit</dt>
                <dd>{offer.term === "12m" ? "12 Monate, danach monatlich kündbar" : "Monatlich kündbar"}</dd>
                <dt className="text-[color:var(--muted)]">Pause / Urlaub</dt>
                <dd>
                  Jederzeit selbst einstellbar (unten).{" "}
                  {Number(offer.softwareFee) > 0 ? `In der Pause fallen nur ${eur(Number(offer.softwareFee))} netto im Monat an.` : "In der Pause fällt keine Vergütung an."}
                </dd>
                <dt className="text-[color:var(--muted)]">Vertrag</dt>
                <dd>
                  <a href={`/angebot/${offer.token}`} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                    Angebot {offer.number} ansehen
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
        </Card>

        <PauseCard
          pause={pause ? { status: pause.status, startsAt: pause.startsAt.toISOString(), endsAt: pause.endsAt?.toISOString() ?? null, kind: pause.kind } : null}
          today={today}
          minDate={startYmd > today ? startYmd : today}
          softwareFeeText={softwareFee > 0 ? `In der Pause berechnen wir nur die Software-Gebühr von ${eur(softwareFee)} netto im Monat, tagesgenau.` : "In der Pause fällt keine Vergütung an."}
          readOnly={ctx.preview}
        />

        {customer.onboarding ? (
          <Card>
            <CardHeader title="Benachrichtigungen" icon={Bell} />
            <div className="p-5">
              <LeadEmailToggle
                enabled={customer.leadEmail}
                email={((customer.onboarding.questionnaire ?? {}) as { leadEmails?: string[] }).leadEmails?.join(", ") || ctx.email}
                readOnly={ctx.preview}
              />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Zahlung und Rechnungsdaten" icon={CreditCard} />
          <div className="p-5">
            <p className="text-sm text-[color:var(--muted)]">
              Zahlungsart (SEPA-Lastschrift oder Karte), Rechnungsadresse und USt-IdNr. ändern Sie sicher über unseren
              Zahlungsdienstleister Stripe.
            </p>
            {portal && PORTAL_MSG[portal] ? <p className="mt-3 text-sm font-medium text-rose-700">{PORTAL_MSG[portal]}</p> : null}
            <form action={openPortalAction} className="mt-4">
              <button
                type="submit"
                disabled={!customer.stripeCustomerId || ctx.preview}
                className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
              >
                Zahlungsart und Rechnungsdaten ändern
              </button>
            </form>
            {!customer.stripeCustomerId ? (
              <p className="mt-3 text-xs text-[color:var(--muted)]">Für Ihr Konto ist noch keine Online-Zahlung hinterlegt.</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Rechnungen" icon={FileText} count={invoices.length || undefined} />
          {invoices.length === 0 ? (
            <p className="p-5 text-sm text-[color:var(--muted)]">
              {customer.stripeCustomerId ? "Noch keine Rechnungen." : "Ihre Rechnungen erhalten Sie per E-Mail."}
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {invoices.map((inv) => {
                const st = STATUS[inv.status ?? ""] ?? { label: inv.status ?? "", tone: "neutral" as const };
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[15px]">
                    <span className="font-medium">{inv.number ?? "Rechnung"}</span>
                    <span className="text-[color:var(--muted)]">{date(inv.created)}</span>
                    <span className="tabular-nums">{eur(inv.total)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="ml-auto flex gap-3 text-sm">
                      {inv.status === "open" && inv.hostedUrl ? (
                        <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                          Jetzt bezahlen
                        </a>
                      ) : null}
                      {inv.pdfUrl ? (
                        <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                          PDF
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
