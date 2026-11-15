// Zahlen-Seite vor dem ersten Lead (Ole, 15.11.2026, Go-live-Härtung): statt lauter Nullen ein klarer Hinweis,
// wann Zahlen kommen, und (falls offen) der eine nächste Schritt „Einrichtung abschließen“.
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { buttonClass, Card } from "@/components/ui";
import { customerExtras, customerSetupProgress, loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

const dateFmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(d);

/** Hat der Kunde noch keinen einzigen Lead? */
export async function nochOhneLeads(customerId: string): Promise<boolean> {
  return (await prisma.lead.count({ where: { customerId }, take: 1 }).catch(() => 1)) === 0;
}

export async function ZahlenNochLeer({ customerId, now }: { customerId: string; now: number }) {
  const ob = await loadOnboarding({ customerId }).catch(() => null);
  const offer = ob?.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
  const progress = ob ? customerSetupProgress(onboardingChecklist(ob, offer), await customerExtras(customerId)) : null;
  const start = ob?.startDate && ob.startDate.getTime() > now ? ob.startDate : null;
  return (
    <Card className="flex flex-col items-start gap-3 px-5 py-6" data-zahlen-leer>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]">
        <BarChart3 className="h-5 w-5" />
      </span>
      <div>
        <div className="text-base font-semibold">Ihre Zahlen erscheinen ab dem Kampagnenstart{start ? ` am ${dateFmt(start)}` : ""}.</div>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Sobald der erste Lead da ist, sehen Sie hier Leads, Termine, Abschlüsse und Ihren Gewinn.</p>
      </div>
      {progress && !progress.complete ? (
        <Link href="/buyer/einrichtung" className={buttonClass("primary", "md")}>
          Einrichtung abschließen ({progress.done} von {progress.total})
        </Link>
      ) : null}
    </Card>
  );
}
