import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { NextStepReminderToggle } from "@/components/next-step-reminder-toggle";
import { CrossSellReminderToggle, PoliceReminderToggle } from "@/app/buyer/provisionen/cross-sell-toggle";
import { canEditProvision } from "@/lib/provision-server";
import { LeadEmailToggle } from "@/app/buyer/konto/pause-card";
import { LeadBenachrichtigungWahl } from "./lead-benachrichtigung-wahl";
import { mailScope, pushScope, type LeadScope } from "@/lib/lead-benachrichtigung-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Erinnerungen & Aufgaben | performancegrowth" };

// Erinnerungen & Aufgaben (Ole, 15.11.2026): eigene Seite statt loser Schalter unten in den Einstellungen.
export default async function ErinnerungenPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [aufgaben, me, logins] = await Promise.all([
    prisma.customer
      .findUnique({ where: { id: ctx.customerId }, select: { crossSellReminder: true, policeReminder: true, leadEmail: true, onboarding: { select: { questionnaire: true } } } })
      .catch(() => null),
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { nextStepReminder: true, teamRole: true, leadMailScope: true, leadPushScope: true } }) : null,
    prisma.user.count({ where: { customerId: ctx.customerId, role: "BUYER" } }).catch(() => 0),
  ]);
  const canEditAufgaben = canEditProvision(ctx);
  // „Neue Leads per E-Mail“ (vorher unter Konto & Rechnungen, UX-Runde 19.11.2026): gilt für das ganze Konto, nur der Inhaber
  const feste = ((aufgaben?.onboarding?.questionnaire ?? {}) as { leadEmails?: string[] }).leadEmails ?? [];
  // Teams (Ole, 26.11.2026): Wahl je Login „nur meine / alle im Team“; der Konto-Schalter nur noch für fest hinterlegte Adressen
  const team = logins > 1 && me ? me : null;
  const leadMail = ctx.teamRole !== "advisor" && aufgaben?.onboarding && (!team || feste.length > 0) ? aufgaben : null;
  const inhaber = ctx.teamRole !== "advisor";
  const mailOptionen: LeadScope[] = inhaber ? ["aus", "meine", "alle"] : ["aus", "meine"];
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader back="/buyer/einstellungen" title="Erinnerungen & Aufgaben" subtitle="Woran die App Sie erinnert und welche Aufgaben sie auf „Heute“ anlegt." />
      <div className="space-y-6" data-erinnerungen>
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Für Sie persönlich</h2>
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <NextStepReminderToggle initial={me?.nextStepReminder ?? true} disabled={!ctx.userId || ctx.preview} />
          </div>
        </section>
        {team || leadMail ? (
          <section id="neue-leads">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Neue Leads</h2>
            {team ? (
              <div className="mb-3 divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-erinnerungen-lead-team>
                <LeadBenachrichtigungWahl kanal="mail" titel="E-Mail" wert={mailScope(team, aufgaben?.leadEmail ?? true)} optionen={mailOptionen} disabled={ctx.preview} />
                {inhaber ? <LeadBenachrichtigungWahl kanal="push" titel="Push" wert={pushScope(team)} optionen={["meine", "alle"]} disabled={ctx.preview} /> : null}
              </div>
            ) : null}
            {leadMail ? (
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-5 py-3 shadow-[var(--shadow-sm)]" data-erinnerungen-lead-mail>
                <LeadEmailToggle enabled={leadMail.leadEmail} email={feste.join(", ") || ctx.email} readOnly={ctx.preview} />
              </div>
            ) : null}
          </section>
        ) : null}
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
