import { redirect } from "next/navigation";
import { Ban, CalendarDays, CheckCircle2, Clock, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { PROVIDER_LABELS } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { disconnectOwnCalendarAction } from "./actions";
import { BlockTimes, LeadTimesForm, RemindButton, SourcePicker } from "@/components/calendar-sources";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import { loadTeamCalendars, providerLabel } from "@/lib/calendar/team";
import {
  addBlockAction,
  adoptOwnCalendarAction,
  connectAllianzAction,
  deleteBlockAction,
  disconnectAllianzAction,
  disconnectNativeCalendarAction,
  remindAdvisorCalendarAction,
  removeIcsAction,
  saveIcsAction,
  saveLeadTimesAction,
} from "./source-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mein Kalender | performancegrowth" };

// Ein Kalender je Person: Der Inhaber verbindet den Kalender des Kundenkontos,
// jeder Berater seinen eigenen. Die Agentur ist frei, wenn mindestens eine
// Person frei ist; Termine werden reihum verteilt (lib/calendar bookingKeys).
export default async function OwnCalendarPage({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { gcal } = await searchParams;
  const ro = ctx.preview;
  const owner = ctx.teamRole === "owner" || !ctx.userId;
  const [own, customer, team] = await Promise.all([
    ctx.userId
      ? prisma.advisorCalendar.findUnique({ where: { userId: ctx.userId }, select: { status: true, provider: true, accountEmail: true } })
      : null,
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { vermittlerTyp: true } }),
    owner ? loadTeamCalendars(ctx.customerId) : null,
  ]);
  const ownConnected = own?.status === "connected";
  const makler = customer?.vermittlerTyp === "makler";
  // Inhaber: Kalender des Kundenkontos. Berater: eigener (nur wenn verbunden gibt es Lead-Zeiten/Blockierungen).
  const key = owner ? ctx.customerId : ownConnected ? userCalendarKey(ctx.userId!) : null;
  const setup = key ? await loadCalendarSetup(ctx.customerId, key) : null;
  const mainConnected = !!setup?.status.native.connected;
  const gcalNote =
    gcal === "connected" ? (
      <p className="mb-4 font-medium text-emerald-700">Kalender verbunden.</p>
    ) : gcal ? (
      <p className="mb-4 font-medium text-rose-700">
        {gcal === "consent"
          ? "Ihr Unternehmen muss die Verbindung erst freigeben. Bitte kurz bei uns melden, dann richten wir es gemeinsam ein."
          : "Das hat nicht geklappt. Bitte noch einmal versuchen."}
      </p>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Mein Kalender" subtitle="Termine für Ihre Leads direkt in Ihrem Kalender" />
      {gcalNote}

      <Card>
        <CardHeader title="Ihr Kalender" icon={CalendarDays} />
        <div className="space-y-4 p-5 text-[15px]">
          {owner ? (
            <>
              {/* Früher verbundener „eigener Kalender“ des Inhabers (altes Modell) */}
              {ownConnected && !mainConnected ? (
                <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-alter-kalender>
                  <p>
                    Ihr {PROVIDER_LABELS[own!.provider] ?? "Kalender"}
                    {own!.accountEmail ? ` (${own!.accountEmail})` : ""} ist noch als persönlicher Kalender verbunden. Übernehmen Sie ihn als Ihren Kalender, dann gilt er für alle Termine.
                  </p>
                  <form action={adoptOwnCalendarAction} className="mt-3">
                    <button className={buttonClass("primary", "sm")} disabled={ro}>
                      Als Ihren Kalender übernehmen
                    </button>
                  </form>
                </div>
              ) : null}
              {ownConnected && mainConnected ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" data-alter-kalender>
                  <span className="min-w-0 flex-1">
                    Doppelt verbunden: Zusätzlich ist noch ein persönlicher {PROVIDER_LABELS[own!.provider] ?? "Kalender"}
                    {own!.accountEmail ? ` (${own!.accountEmail})` : ""} verbunden. Ein Kalender genügt, bitte trennen.
                  </span>
                  <form action={disconnectOwnCalendarAction}>
                    <button className={buttonClass("secondary", "sm")} disabled={ro}>
                      Trennen
                    </button>
                  </form>
                </div>
              ) : null}
              {setup ? (
                <SourcePicker
                  status={setup.status}
                  readOnly={ro}
                  connectLinks={{ google: "/api/google/connect?zurueck=kalender", microsoft: "/api/microsoft/connect?zurueck=kalender" }}
                  icsAction={saveIcsAction}
                  removeIcsAction={removeIcsAction}
                  allianzAction={connectAllianzAction}
                  disconnectAllianzAction={disconnectAllianzAction}
                  disconnectNativeAction={disconnectNativeCalendarAction}
                  allianzOption={!makler}
                />
              ) : null}
            </>
          ) : ownConnected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> {PROVIDER_LABELS[own!.provider] ?? "Kalender"} verbunden
                {own!.accountEmail ? ` (${own!.accountEmail})` : ""}
              </span>
              <form action={disconnectOwnCalendarAction}>
                <button className={buttonClass("ghost", "sm")} disabled={ro}>
                  Trennen
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[color:var(--muted)]">Verbinden Sie Ihren Kalender. Termine für Ihre Leads landen dann nur in Ihren freien Zeiten direkt dort.</p>
              <div className="flex flex-wrap gap-2">
                <a href="/api/google/connect?fuer=mich" className={buttonClass("primary", "md", ro ? "pointer-events-none opacity-60" : "")}>
                  Google-Kalender verbinden
                </a>
                <a href="/api/microsoft/connect?fuer=mich" className={buttonClass("secondary", "md", ro ? "pointer-events-none opacity-60" : "")}>
                  Outlook / Microsoft 365 verbinden
                </a>
              </div>
            </div>
          )}
        </div>
      </Card>

      {owner && team && team.rows.length >= 2 ? (
        <Card className="mt-5">
          <CardHeader title="Team" icon={Users} />
          <div className="space-y-3 p-5 text-[15px]" data-team-kalender>
            <p className="text-sm text-[color:var(--muted)]">Ihre Agentur ist für Termine frei, wenn mindestens eine Person frei ist. Termine werden reihum verteilt.</p>
            {!team.anyConnected ? (
              <p className="rounded-[var(--radius-md)] bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                Noch niemand hat einen Kalender verbunden. Bis dahin können Leads keine Termine buchen.
              </p>
            ) : null}
            <ul className="divide-y divide-[color:var(--border)]">
              {team.rows.map((r) => (
                <li key={r.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {r.name}
                      {r.owner ? <span className="ml-1.5 text-xs font-normal text-[color:var(--muted)]">Inhaber</span> : null}
                    </div>
                    <div className="truncate text-xs text-[color:var(--muted)]">
                      {r.name !== r.email ? `${r.email} · ` : ""}
                      {r.receivesLeads ? "erhält Leads" : "erhält keine Leads"}
                    </div>
                  </div>
                  {r.connected ? (
                    <span className="flex items-center gap-1 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> {providerLabel(r.provider)}
                    </span>
                  ) : (
                    <span className="text-sm text-amber-800">kein Kalender</span>
                  )}
                  {!r.owner && !r.connected ? (
                    <RemindButton action={remindAdvisorCalendarAction} userId={r.userId} readOnly={ro} />
                  ) : null}
                  {!r.owner && !r.connected && r.remindedAt ? (
                    <span className="w-full text-xs text-[color:var(--muted)] sm:w-auto">
                      erinnert am {r.remindedAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}

      {setup ? (
        <>
          <Card className="mt-5">
            <CardHeader title="Wann dürfen Leads Termine buchen?" icon={Clock} />
            <div className="p-5">
              <p className="mb-4 text-sm text-[color:var(--muted)]">Unser Assistent schlägt nur diese Zeiten vor, und nur wenn Sie dann frei sind.</p>
              <LeadTimesForm initial={setup.leadTimes} action={saveLeadTimesAction} readOnly={ro} source={setup.source} />
            </div>
          </Card>
          <Card className="mt-5">
            <CardHeader title="Zeit blockieren" icon={Ban} />
            <div className="p-5">
              <p className="mb-4 text-sm text-[color:var(--muted)]">In diesen Zeiten bieten wir keine Termine an, auch wenn Ihr Kalender frei ist.</p>
              <BlockTimes blocks={setup.blocks} addAction={addBlockAction} deleteAction={deleteBlockAction} readOnly={ro} />
            </div>
          </Card>
        </>
      ) : (
        <p className="mt-5 text-sm text-[color:var(--muted)]">Sobald Ihr Kalender verbunden ist, können Sie hier Ihre Zeiten für Leads einstellen.</p>
      )}
    </main>
  );
}
