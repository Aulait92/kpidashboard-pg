// Hinweis im Kundenbereich, wenn ein kostenloser Zeitraum (Testphase, Prämie) in höchstens 7 Tagen endet
// (AGB „Testphasen und kostenlose Zeiträume“, Ole 14.11.2026). Knopf „Beenden“ führt zur Kündigung im Konto.

import { CalendarClock } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { freePeriodNotices } from "@/lib/free-periods";
import { PRICE_LIST } from "@/lib/offer-pricing";

export async function FreePeriodNotices({ customerId, readOnly = false }: { customerId: string; readOnly?: boolean }) {
  const c = await prisma.customer
    .findUnique({
      where: { id: customerId },
      select: {
        empfehlungEnabled: true,
        empfehlungMonthly: true,
        empfehlungFree: true,
        empfehlungCancelAt: true,
        empfehlungTrialEndsAt: true,
        bestandFreeUntil: true,
        bestandMonthly: true,
        bestandCancelAt: true,
      },
    })
    .catch(() => null);
  if (!c) return null;
  const notices = freePeriodNotices(c, { empfehlungPrice: PRICE_LIST.empfehlungModuleMonthly });
  if (!notices.length) return null;
  return (
    <div className="mb-4 space-y-2" data-free-period-notices>
      {notices.map((n) => (
        <div key={n.key} className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{n.title}</p>
            <p>{n.text}</p>
          </div>
          {!readOnly ? (
            <ButtonLink href={n.href} variant="secondary" size="sm">
              Beenden
            </ButtonLink>
          ) : null}
        </div>
      ))}
    </div>
  );
}
