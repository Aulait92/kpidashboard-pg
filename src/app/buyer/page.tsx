import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, MousePointerClick } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { TodayInbox } from "@/components/today-inbox";
import { FirstDay } from "@/components/first-day";
import { IntroVideoCard } from "@/components/intro-video";
import { LiveRefresh } from "@/components/live-refresh";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { isNewUi } from "@/lib/new-ui";
import { EmpfehlungHeuteHint } from "@/components/empfehlung/server";
import { getBuyerContext } from "@/lib/buyer-context";
import { loadInbox } from "@/lib/inbox";
import { prisma } from "@/lib/prisma";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { ReferralNudgeCard } from "@/components/kollegen";
import { loadReferralNudge } from "@/lib/kollegen";
import { UpdatesHeuteCard } from "@/components/neuigkeiten";
import { unreadUpdates } from "@/lib/neuigkeiten";
import { dismissUpdatesAction } from "./neuigkeiten/actions";

// Startseite des Kundenbereichs für alle Kunden: „Heute" – eine
// Aufgabenliste (Termine, Ergebnisse, Chats, Rückrufe), die man leer
// arbeitet (mit WhatsApp zusätzlich Chats). Die Zahlen haben einen eigenen Reiter.
export const dynamic = "force-dynamic";
export const metadata = { title: "Heute | performancegrowth" };

type SearchParams = Promise<{ range?: string; from?: string; to?: string; lead?: string }>;

export default async function BuyerHomePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const [whatsapp, leadCount, newUi, introSeen] = await Promise.all([
    hasWhatsAppInbox(ctx.customerId),
    prisma.lead.count({ where: { customerId: ctx.customerId } }),
    isNewUi(ctx.customerId),
    ctx.userId && !ctx.preview ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { introVideoSeenAt: true } }).then((u) => !!u?.introVideoSeenAt) : true,
  ]);
  // Einführungsvideo (nur neue Oberfläche): bis angesehen oder weggeklickt
  const introCard = newUi && !introSeen ? <IntroVideoCard /> : null;
  if (leadCount === 0) {
    // Erster Tag: noch kein Lead → erklären, wie es losgeht (statt leerer Zahlen/„Alles erledigt“).
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <LiveRefresh />
        <PageHeader title="Willkommen" subtitle="Schön, dass Sie da sind." />
        {introCard}
        <FirstDay customerId={ctx.customerId} owner={ctx.teamRole !== "advisor"} whatsapp={whatsapp} />
      </main>
    );
  }
  const [data, customer, me, nudge, updates] = await Promise.all([
    loadInbox(ctx),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } }),
    ctx.teamRole === "advisor" && ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }) : null,
    // „Kollegen empfehlen“ nach positiven Momenten (nur Inhaber, nicht in der Vorschau)
    ctx.teamRole === "owner" && !ctx.preview ? loadReferralNudge(ctx.customerId).catch(() => null) : null,
    // Neuigkeiten seit dem letzten Besuch (nicht in der Vorschau)
    ctx.userId && !ctx.preview ? unreadUpdates(ctx.userId, ctx.customerId).catch(() => []) : [],
  ]);
  const updatesCard = updates.length ? <UpdatesHeuteCard title={updates[0].title} more={updates.length - 1} dismiss={dismissUpdatesAction} /> : null;
  const nudgeCard = nudge ? <ReferralNudgeCard nudgeKey={nudge.key} title={nudge.title} text={nudge.text} /> : null;
  const first = (me?.displayName ?? (customer?.name ?? "").replace(/^Allianz\s+/i, "")).split(" ")[0];
  const hour = Number(
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(new Date()),
  );
  const greet = hour < 11 ? "Guten Morgen" : hour < 18 ? "Hallo" : "Guten Abend";
  const today = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  if (newUi) {
    // Neue Oberfläche: Desktop (ab xl) links die Aufgaben, rechts der gewählte
    // Kontakt. Handy/Tablet: Liste → Kontakt (Zurück „Heute“).
    const { lead } = await searchParams;
    const selected = lead && /^[\w-]{1,64}$/.test(lead) ? lead : null;
    return (
      <main className="w-full flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <LiveRefresh />
        <div className="xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start xl:gap-6">
          <section className={selected ? "hidden xl:block" : undefined}>
            <PageHeader title={`${greet}${first ? `, ${first}` : ""}`} subtitle={today} />
            {introCard}
            {updatesCard}
            {nudgeCard}
            <EmpfehlungHeuteHint ctx={ctx} />
            <TodayInbox data={data} newUi leadHref="/buyer?lead={id}" selectedLeadId={selected} />
          </section>
          <section
            className={
              selected
                ? "xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto xl:rounded-[var(--radius-lg)] xl:border xl:border-[color:var(--border)] xl:bg-white xl:p-5"
                : "hidden xl:sticky xl:top-6 xl:block"
            }
            aria-label="Kontakt"
          >
            {selected ? (
              <>
                <Link
                  href="/buyer"
                  scroll={false}
                  className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-[color:var(--brand)] hover:underline xl:hidden"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Heute
                </Link>
                <LeadDetailBody leadId={selected} team={ctx} newUi />
              </>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border-strong)] px-6 text-center text-[color:var(--muted)]">
                <MousePointerClick className="mb-3 h-8 w-8" />
                <p className="text-base">Wählen Sie links eine Aufgabe.</p>
                <p className="mt-1 text-sm">Die Details zum Kontakt erscheinen hier.</p>
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <LiveRefresh />
      <PageHeader title={`${greet}${first ? `, ${first}` : ""}`} subtitle={today} />
      {updatesCard}
      {nudgeCard}
      <EmpfehlungHeuteHint ctx={ctx} />
      <TodayInbox data={data} />
    </main>
  );
}
