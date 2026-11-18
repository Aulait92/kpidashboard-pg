// Werbebudget, Produkte und Pause (UX-Überarbeitung, Ole 15.11.2026): stehen nur noch unter „Wachstum“, nicht mehr
// zusätzlich im Konto. Eigene Datenbeschaffung, damit die Karten unabhängig von der Konto-Seite laufen.

import { prisma } from "@/lib/prisma";
import { currentPause, todayBerlin } from "@/lib/pause";
import { budgetState } from "@/lib/budget";
import { productOverview } from "@/lib/produkt-buchen";
import { isPrepaid } from "@/lib/offer-pricing";
import { PauseCard } from "./pause-card";
import { BudgetCard } from "./budget-card";
import { ProductsCard } from "./produkte-card";

const TZ = "Europe/Berlin";
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export async function WerbungKarten({ customerId, readOnly }: { customerId: string; readOnly: boolean }) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { plan: true, billingInterval: true, retainerStart: true, onboarding: { select: { offerId: true } } },
  });
  if (!customer) return null;
  const [offer, pause, budget, products] = await Promise.all([
    customer.onboarding?.offerId ? prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { softwareFee: true } }) : null,
    currentPause(customerId),
    budgetState(customerId),
    productOverview(customerId),
  ]);
  const today = todayBerlin();
  const startYmd = customer.retainerStart ? new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(customer.retainerStart) : today;
  const softwareFee = offer ? Number(offer.softwareFee) : customer.plan === "service" ? 0 : 349;
  const pauseText =
    isPrepaid(customer.billingInterval)
      ? "Bei Vorauszahlung pausieren nur die Anzeigen, eine Gutschrift gibt es dafür nicht."
      : softwareFee > 0
        ? `In der Pause zahlen Sie nur ${eur(softwareFee)} netto im Monat.`
        : "In der Pause zahlen Sie nichts.";
  return (
    <>
      <div id="budget" className="scroll-mt-20" />
      <BudgetCard
        lines={budget.lines}
        upcoming={budget.upcoming.map((u) => ({ ...u, validFrom: u.validFrom.toISOString() }))}
        ctx={budget.ctx}
        pending={budget.pending ? { monthlyBudgetTo: budget.pending.monthlyBudgetTo, createdAt: budget.pending.createdAt.toISOString() } : null}
        today={today}
        readOnly={readOnly}
        estimated={budget.estimated}
      />
      <ProductsCard booked={products.booked} bookable={products.bookable} lines={products.lines} ctx={products.ctx} today={today} readOnly={readOnly} />
      <div id="pause" className="scroll-mt-20" />
      <PauseCard
        pause={pause ? { status: pause.status, startsAt: pause.startsAt.toISOString(), endsAt: pause.endsAt?.toISOString() ?? null, kind: pause.kind } : null}
        today={today}
        minDate={startYmd > today ? startYmd : today}
        softwareFeeText={pauseText}
        readOnly={readOnly}
      />
    </>
  );
}
