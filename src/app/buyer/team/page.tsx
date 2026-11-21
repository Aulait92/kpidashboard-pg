import Link from "next/link";
import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { memberName, teamMembers } from "@/lib/team";
import { berlinYmd, teamAbsences } from "@/lib/absence";
import { addSeatCostHint, addsSeatCost, berlinDayStart, isActiveSeller, seatSummary } from "@/lib/seats";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";
import { bereitFuerLeads, wartetText } from "@/lib/team-bereit";
import { loadBeraterPersonen } from "@/lib/calendar/berater-allianz";
import { ladeTeamUeberblick } from "@/lib/team-ueberblick-server";
import { offenText, termineKurz } from "@/lib/team-ueberblick";
import { isNewUi } from "@/lib/new-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team | performancegrowth" };


export default async function TeamPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const readOnly = ctx.preview;

  const members = await teamMembers(ctx.customerId);
  const now = new Date();
  const [personen, ueberblick, newUi, sp] = await Promise.all([
    loadBeraterPersonen(ctx.customerId),
    // Team-Überblick je Mitglied: Termine 7 Tage und Offenes (Ole, 21.11.2026, lib/team-ueberblick.ts), ab 2 Personen
    ladeTeamUeberblick(ctx, now, members).catch(() => null),
    isNewUi(ctx.customerId),
    searchParams,
  ]);
  // Kontakt öffnen mit Rücksprung auf die aufgeklappte Person (neue Oberfläche), sonst die alte Kontaktseite
  const leadHref = (userId: string) => (newUi ? `/buyer/kontakte/{id}?von=team&m=${encodeURIComponent(userId)}` : "/buyer/leads/{id}");
  // Bereit für Leads erst mit Kalender und App mit Mitteilungen (Ole, 21.11.2026, lib/team-bereit.ts)
  const mitPush = new Set(
    (await prisma.pushSubscription.findMany({ where: { userId: { in: members.map((m) => m.id) } }, select: { userId: true } })).map((p) => p.userId),
  );
  const since = daysAgo(30);
  const counts = await prisma.lead.groupBy({
    by: ["assignedUserId"],
    where: { customerId: ctx.customerId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const leads30 = new Map(counts.map((c) => [c.assignedUserId, c._count._all]));
  const receivers = members.filter((m) => m.receivesLeads).length;
  const absences = await teamAbsences(ctx.customerId);
  const today = berlinYmd(new Date());
  const billing = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { seatsIncluded: true, seatMonthly: true } });
  const seatPrice = Number(billing?.seatMonthly ?? 0);
  // Platz-Abrechnung nur bei Verträgen mit Plätzen (seit 11.11.2026); Alt-Verträge unverändert.
  // Seit 14.11.2026 zählen nur aktive Verkäufer (bekommt Leads an oder heute Leads bekommen), lib/seats.ts.
  const dayStart = berlinDayStart(new Date());
  const activeToday = new Set(members.filter((m) => isActiveSeller(m, dayStart)).map((m) => m.id));
  const seats = billing?.seatsIncluded != null && seatPrice > 0 ? { included: billing.seatsIncluded, price: seatPrice, active: activeToday.size } : null;
  // Kostenhinweis vor dem Einschalten: nur, wenn das Mitglied dadurch neu als aktiver Verkäufer zählt
  const enableCost = seats && addsSeatCost(seats) ? addSeatCostHint(seats.price, "Ein weiterer aktiver Verkäufer") : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="Team" subtitle="Neue Leads gehen reihum an alle mit Kalender und App, Abwesende werden übersprungen. Berater sehen nur ihre eigenen." />
      <div className="space-y-5">
        {members.length > 1 && receivers === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
            Gerade bekommt niemand neue Leads. Neue Leads sehen dann nur Sie.
          </p>
        ) : null}

        <Card>
          <CardHeader title={`Mitglieder (${members.length})`} icon={UsersRound} actions={<span className="text-sm text-[color:var(--muted)]">bekommt Leads</span>} />
          <ul className="divide-y divide-[color:var(--border)]">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                readOnly={readOnly}
                m={{
                  id: m.id,
                  name: memberName(m),
                  email: m.email,
                  displayName: m.displayName,
                  isMe: m.id === ctx.userId,
                  owner: m.teamRole !== "advisor",
                  receivesLeads: m.receivesLeads,
                  ownCalendar: m.advisorCalendar?.status === "connected",
                  wartet: m.receivesLeads
                    ? wartetText(bereitFuerLeads({ owner: m.teamRole !== "advisor", kalender: m.advisorCalendar?.status === "connected", push: mitPush.has(m.id) }).fehlt)
                    : null,
                  leads30: leads30.get(m.id) ?? 0,
                  loggedIn: !!m.lastLoginAt,
                  twoFactor: !!m.totpEnabledAt,
                  absence: absences.get(m.id) ?? null,
                  // Allianz-Person nur für Berater ohne eigenen Google-/Outlook-Kalender
                  allianz:
                    personen?.resources.length && m.teamRole === "advisor" && !(m.advisorCalendar?.status === "connected" && !personen.gewaehlt[m.id])
                      ? { resources: personen.resources, resourceId: personen.gewaehlt[m.id]?.resourceId ?? null, email: personen.gewaehlt[m.id]?.email ?? m.email }
                      : null,
                  enableCostHint: !m.receivesLeads && !activeToday.has(m.id) ? enableCost : null,
                  ueberblick: (() => {
                    const u = ueberblick?.get(m.id);
                    return u ? { u, termine: termineKurz(u), offen: offenText(u), warn: u.warn.length > 0 } : null;
                  })(),
                }}
                colleagues={members.filter((o) => o.id !== m.id).map((o) => ({ id: o.id, name: memberName(o) }))}
                today={today}
                nowIso={now.toISOString()}
                leadHref={leadHref(m.id)}
                defaultOpen={sp.m === m.id}
              />
            ))}
          </ul>
        </Card>

        {seats ? (
          <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]" data-seat-summary>
            {seatSummary(seats)}
          </p>
        ) : null}

        {/* Auswertung je Person steht unter Wachstum (Karte „Team im Zeitraum“), Ole 19.11.2026: kurzer Weg dorthin */}
        {members.length > 1 ? (
          <Link href="/buyer/wachstum#team-zeitraum" className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-[15px] hover:border-[color:var(--brand)]" data-team-zeitraum-link>
            <span>Leads, Abschlüsse und Provision je Person</span>
            <span className="text-sm font-medium text-[color:var(--brand)]">Team im Zeitraum</span>
          </Link>
        ) : null}

        <InviteForm readOnly={readOnly} costHint={seats && addsSeatCost(seats) ? addSeatCostHint(seats.price) : null} />
      </div>
    </main>
  );
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
