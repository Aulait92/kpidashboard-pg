import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { NextStepReminderToggle } from "@/components/next-step-reminder-toggle";
import { CrossSellReminderToggle, PoliceReminderToggle } from "@/app/buyer/provisionen/cross-sell-toggle";
import { canEditProvision } from "@/lib/provision-server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Erinnerungen & Aufgaben | performancegrowth" };

// Erinnerungen & Aufgaben (Ole, 15.11.2026): eigene Seite statt loser Schalter unten in den Einstellungen.
export default async function ErinnerungenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [aufgaben, me] = await Promise.all([
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { crossSellReminder: true, policeReminder: true } }).catch(() => null),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { nextStepReminder: true } }) : null,
  ]);
  const canEditAufgaben = canEditProvision(ctx);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <Link href="/buyer/einstellungen" className="mb-2 inline-flex items-center gap-1 text-sm text-[color:var(--muted)] hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" /> Einstellungen
      </Link>
      <PageHeader title="Erinnerungen & Aufgaben" subtitle="Was die App Sie erinnert und welche Aufgaben sie auf „Heute“ anlegt." />
      <div className="space-y-6" data-erinnerungen>
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Für Sie persönlich</h2>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <NextStepReminderToggle initial={me?.nextStepReminder ?? true} disabled={!ctx.userId || ctx.preview} />
          </div>
        </section>
        <section id="aufgaben">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Aufgaben nach dem Abschluss</h2>
          <div className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <CrossSellReminderToggle on={aufgaben?.crossSellReminder ?? true} canEdit={canEditAufgaben} />
            <PoliceReminderToggle on={aufgaben?.policeReminder ?? true} canEdit={canEditAufgaben} />
          </div>
          {!canEditAufgaben ? <p className="mt-2 px-1 text-xs text-[color:var(--muted)]">Nur der Inhaber kann das ändern.</p> : null}
        </section>
      </div>
    </main>
  );
}
