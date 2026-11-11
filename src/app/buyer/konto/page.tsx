import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, CreditCard, FileText, Package, Percent, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { loadCustomerProvision } from "@/lib/provision-server";
import { getBuyerContext } from "@/lib/buyer-context";
import { billingEnabled, listCustomerInvoices, type CustomerInvoice } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { openPortalAction } from "./actions";
import { LeadEmailToggle, PauseCard } from "./pause-card";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";
import { ModuleBookButton, ModuleCancelButton } from "@/components/bestand/module-book";
import { canSelfBookBestand } from "@/lib/bestand/self-service";
import { annualMultiplier, PRICE_LIST } from "@/lib/offer-pricing";
import { currentPause, todayBerlin } from "@/lib/pause";
import { budgetState } from "@/lib/budget";
import { BudgetCard } from "./budget-card";

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
  if (ctx.teamRole === "advisor") redirect("/buyer");
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
      seatsIncluded: true,
      seatMonthly: true,
      seatsBilled: true,
      billingInterval: true,
      bestandMonthly: true,
      existingCustomersEnabled: true,
      bestandRequestedAt: true,
      bestandCancelAt: true,
      whatsAppAccount: { select: { id: true } },
      onboarding: { select: { offerId: true, questionnaire: true } },
    },
  });
  if (!customer) redirect("/buyer");
  const offer = customer.onboarding?.offerId
    ? await prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { term: true, softwareFee: true, number: true, token: true, annualFreeMonths: true } })
    : null;

  let invoices: CustomerInvoice[] = [];
  if (customer.stripeCustomerId && billingEnabled()) {
    invoices = await listCustomerInvoices(customer.stripeCustomerId).catch((err) => {
      reportError(err, "billing-invoices", { customer: ctx.customerId });
      return [];
    });
  }
  const monthly = customer.retainerMonthly != null ? Number(customer.retainerMonthly) : null;
  const bestandCheck = !customer.existingCustomersEnabled && customer.plan !== "service" ? await canSelfBookBestand(ctx.customerId) : null;
  const pause = await currentPause(ctx.customerId);
  const budget = await budgetState(ctx.customerId);
  const provision = await loadCustomerProvision(ctx.customerId);
  const today = todayBerlin();
  const startYmd = customer.retainerStart ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(customer.retainerStart) : today;
  const softwareFee = offer ? Number(offer.softwareFee) : customer.plan === "service" ? 0 : 349;
  const service = customer.plan === "service";
  // Zusätze (weitere Logins, Bestandskunden-Modul) und Zahlweise
  const seatMonthly = customer.seatMonthly != null ? Number(customer.seatMonthly) : null;
  const seatsFee = seatMonthly ? customer.seatsBilled * seatMonthly : 0;
  const bestandFee = customer.bestandMonthly != null ? Number(customer.bestandMonthly) : 0;
  const monthlyTotal = monthly != null ? monthly + seatsFee + bestandFee : null;
  const annual = customer.billingInterval === "year";
  const yearly = annual && monthlyTotal != null ? monthlyTotal * annualMultiplier(offer?.annualFreeMonths ?? PRICE_LIST.annualFreeMonths) : null;
  const pauseText = annual
    ? "Bei jährlicher Vorauszahlung pausieren nur die Anzeigen, eine Gutschrift gibt es dafür nicht."
    : softwareFee > 0
      ? `In der Pause zahlen Sie nur ${eur(softwareFee)} netto im Monat.`
      : "In der Pause zahlen Sie nichts.";

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
                <dt className="text-[color:var(--muted)]">{seatsFee || bestandFee ? "Paket monatlich" : "Monatlich"}</dt>
                <dd>{eur(monthly)} netto zzgl. USt.</dd>
              </>
            ) : null}
            {customer.seatsIncluded != null ? (
              <>
                <dt className="text-[color:var(--muted)]">Logins</dt>
                <dd data-konto-seats>
                  {customer.seatsIncluded} inklusive
                  {seatMonthly && customer.seatsBilled > 0 ? `, ${customer.seatsBilled} weitere je ${eur(seatMonthly)} = ${eur(seatsFee)} im Monat` : ""}
                  {seatMonthly === 0 ? " · weitere nach Sondervereinbarung" : ""}
                </dd>
              </>
            ) : null}
            {customer.existingCustomersEnabled ? (
              <>
                <dt className="text-[color:var(--muted)]">Bestandskunden</dt>
                <dd className="space-y-2">
                  <div>{bestandFee ? `Modul gebucht, ${eur(bestandFee)} im Monat` : "Modul freigeschaltet"}</div>
                  {customer.bestandMonthly != null ? (
                    <ModuleCancelButton cancelAt={customer.bestandCancelAt?.toISOString() ?? null} readOnly={ctx.preview} annual={annual} />
                  ) : null}
                </dd>
              </>
            ) : null}
            {monthlyTotal != null && (seatsFee || bestandFee) ? (
              <>
                <dt className="text-[color:var(--muted)]">Monatlich gesamt</dt>
                <dd className="font-semibold">{eur(monthlyTotal)} netto zzgl. USt.</dd>
              </>
            ) : null}
            {monthly != null ? (
              <>
                <dt className="text-[color:var(--muted)]">Zahlweise</dt>
                <dd data-konto-interval>
                  {annual && yearly != null ? `Jährlich im Voraus: ${eur(yearly)} netto (${PRICE_LIST.annualFreeMonths} Monate geschenkt)` : "Monatlich"}
                </dd>
              </>
            ) : null}
            {PRICE_LIST.whatsappIncluded && customer.whatsAppAccount ? (
              <>
                <dt className="text-[color:var(--muted)]">WhatsApp-Gebühren</dt>
                <dd>Im Preis enthalten</dd>
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
                <dd>
                  {annual
                    ? "12 Monate, verlängert sich um 12 Monate, wenn nicht 1 Monat vor Ende gekündigt"
                    : offer.term === "12m"
                      ? "12 Monate, danach monatlich kündbar"
                      : offer.term === "3m"
                        ? "3 Monate, danach monatlich kündbar"
                        : "Monatlich kündbar"}
                </dd>
                <dt className="text-[color:var(--muted)]">Pause / Urlaub</dt>
                <dd>Jederzeit selbst einstellbar (siehe unten)</dd>
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

        <BudgetCard
          lines={budget.lines}
          upcoming={budget.upcoming.map((u) => ({ ...u, validFrom: u.validFrom.toISOString() }))}
          ctx={budget.ctx}
          pending={budget.pending ? { monthlyBudgetTo: budget.pending.monthlyBudgetTo, createdAt: budget.pending.createdAt.toISOString() } : null}
          today={today}
          readOnly={ctx.preview}
        />

        <PauseCard
          pause={pause ? { status: pause.status, startsAt: pause.startsAt.toISOString(), endsAt: pause.endsAt?.toISOString() ?? null, kind: pause.kind } : null}
          today={today}
          minDate={startYmd > today ? startYmd : today}
          softwareFeeText={pauseText}
          readOnly={ctx.preview}
        />

        {customer.whatsAppAccount && !PRICE_LIST.whatsappIncluded ? <WhatsAppFeesCard customerId={ctx.customerId} /> : null}

        {!customer.existingCustomersEnabled && !service ? (
          <Card>
            <CardHeader title="Bestandskunden-Modul" icon={Users} />
            <div className="space-y-3 px-5 pb-5 pt-4 text-sm" data-konto-bestand>
              <p>
                Kundenliste hochladen, Lücken und Anlässe erkennen, passende Kunden per WhatsApp anschreiben. {eur(PRICE_LIST.bestandModuleMonthly)} netto
                im Monat, WhatsApp-Gebühren für bis zu {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat inklusive.
              </p>
              <ModuleBookButton
                monthlyNet={PRICE_LIST.bestandModuleMonthly}
                includedMessages={PRICE_LIST.bestandIncludedMessages}
                canBook={bestandCheck?.ok ?? false}
                reason={bestandCheck && !bestandCheck.ok ? bestandCheck.reason : null}
                requestedAt={customer.bestandRequestedAt?.toISOString() ?? null}
                readOnly={ctx.preview}
                annual={annual}
                freeMonths={PRICE_LIST.annualFreeMonths}
              />
            </div>
          </Card>
        ) : null}

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
          <CardHeader title="Meine Provisionen" icon={Percent} />
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm text-[color:var(--muted)]">
              {provision.typ === "makler" ? "Makler" : "Vertreter"} · {provision.hasCustom ? "eigene Sätze hinterlegt" : "Standardwerte"}. Damit schätzt die App Ihre Provision je Abschluss.
            </p>
            <Link href="/buyer/provisionen" className={buttonClass("secondary", "md")}>
              Provisionen prüfen
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader title="Zahlung und Rechnungsdaten" icon={CreditCard} />
          <div className="p-5">
            <p className="text-sm text-[color:var(--muted)]">Lastschrift oder Karte, Rechnungsadresse, USt-IdNr.</p>
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
