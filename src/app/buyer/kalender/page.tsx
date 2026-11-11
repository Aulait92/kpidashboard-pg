import { redirect } from "next/navigation";
import { Ban, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { PROVIDER_LABELS } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { disconnectOwnCalendarAction } from "./actions";
import { BlockTimes, LeadTimesForm, SourcePicker } from "@/components/calendar-sources";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import {
  addBlockAction,
  connectAllianzAction,
  deleteBlockAction,
  disconnectAllianzAction,
  disconnectNativeCalendarAction,
  removeIcsAction,
  saveIcsAction,
  saveLeadTimesAction,
} from "./source-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mein Kalender | performancegrowth" };

// Eigener Kalender eines Logins (Team): Termine für die eigenen Leads landen
// direkt dort, gebucht wird nur in freie Zeiten.
export default async function OwnCalendarPage({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const { gcal } = await searchParams;
  const readOnly = ctx.preview || !ctx.userId;
  const [own, main] = await Promise.all([
    ctx.userId
      ? prisma.advisorCalendar.findUnique({ where: { userId: ctx.userId }, select: { status: true, provider: true, accountEmail: true } })
      : null,
    prisma.calendarConnection.findUnique({ where: { customerId: ctx.customerId }, select: { status: true, provider: true } }),
  ]);
  const connected = own?.status === "connected";
  const owner = ctx.teamRole === "owner";
  // Inhaber stellt den Agentur-Kalender ein; ein Berater nur seinen eigenen (falls verbunden).
  const key = owner || !ctx.userId ? ctx.customerId : connected ? userCalendarKey(ctx.userId) : null;
  const setup = key ? await loadCalendarSetup(ctx.customerId, key) : null;
  const ro = ctx.preview;
  const makler = (await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { vermittlerTyp: true } }))?.vermittlerTyp === "makler";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Mein Kalender" subtitle="Termine für Ihre Leads direkt in Ihrem Kalender" />
      <Card>
        <CardHeader title="Eigener Kalender" icon={CalendarDays} />
        <div className="space-y-4 p-5 text-[15px]">
          <p className="text-[color:var(--muted)]">Termine für Ihre Leads landen dann nur in freien Zeiten direkt in Ihrem Kalender.</p>
          {gcal === "connected" ? <p className="font-medium text-emerald-700">Kalender verbunden.</p> : null}
          {gcal && gcal !== "connected" ? (
            <p className="font-medium text-rose-700">
              {gcal === "consent"
                ? "Ihr Unternehmen muss die Verbindung erst freigeben. Bitte kurz bei uns melden, dann richten wir es gemeinsam ein."
                : "Das hat nicht geklappt. Bitte noch einmal versuchen."}
            </p>
          ) : null}
          {connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> {PROVIDER_LABELS[own!.provider] ?? "Kalender"} verbunden
                {own!.accountEmail ? ` (${own!.accountEmail})` : ""}
              </span>
              <form action={disconnectOwnCalendarAction}>
                <button className={buttonClass("secondary", "sm")} disabled={readOnly}>
                  Trennen
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <a href="/api/google/connect?fuer=mich" className={buttonClass("secondary", "md", readOnly ? "pointer-events-none opacity-60" : "")}>
                Google-Kalender verbinden
              </a>
              <a href="/api/microsoft/connect?fuer=mich" className={buttonClass("secondary", "md", readOnly ? "pointer-events-none opacity-60" : "")}>
                Outlook / Microsoft 365 verbinden
              </a>
            </div>
          )}
          {owner && main?.status === "connected" ? (
            <p className="text-sm text-[color:var(--muted)]">
              Agentur-Kalender: {PROVIDER_LABELS[main.provider] ?? "Kalender"} verbunden.
            </p>
          ) : null}
        </div>
      </Card>

      {owner && setup ? (
        <Card className="mt-5">
          <CardHeader title="Freie Zeiten der Agentur" icon={CalendarDays} />
          <div className="p-5">
            <SourcePicker
              status={setup.status}
              readOnly={ro}
              connectLinks={{ google: "/api/google/connect", microsoft: "/api/microsoft/connect" }}
              icsAction={saveIcsAction}
              removeIcsAction={removeIcsAction}
              allianzAction={connectAllianzAction}
              disconnectAllianzAction={disconnectAllianzAction}
              disconnectNativeAction={disconnectNativeCalendarAction}
              allianzOption={!makler}
            />
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
        <p className="mt-5 text-sm text-[color:var(--muted)]">Ohne eigenen Kalender gelten für Ihre Leads die Zeiten der Agentur.</p>
      )}
    </main>
  );
}
