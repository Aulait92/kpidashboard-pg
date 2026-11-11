import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { memberName, teamMembers } from "@/lib/team";
import { berlinYmd, teamAbsences } from "@/lib/absence";
import { InviteForm } from "./invite-form";
import { MemberRow } from "./member-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team | performancegrowth" };


export default async function TeamPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const readOnly = ctx.preview;

  const members = await teamMembers(ctx.customerId);
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
  // Platz-Abrechnung nur bei Verträgen mit Logins (seit 11.11.2026); Alt-Verträge unverändert
  const seats = billing?.seatsIncluded != null && seatPrice > 0 ? { included: billing.seatsIncluded, price: seatPrice, used: members.length } : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Team" subtitle="Neue Leads werden reihum verteilt, Abwesende übersprungen. Berater sehen nur ihre eigenen." />
      <div className="space-y-5">
        {members.length > 1 && receivers === 0 ? (
          <p className="rounded-[var(--radius-md)] bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
            Gerade bekommt niemand neue Leads. Neue Leads sehen dann nur Sie.
          </p>
        ) : null}

        <Card>
          <CardHeader title={`Mitglieder (${members.length})`} icon={UsersRound} actions={<span className="text-xs text-[color:var(--muted)]">bekommt Leads</span>} />
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
                  leads30: leads30.get(m.id) ?? 0,
                  loggedIn: !!m.lastLoginAt,
                  absence: absences.get(m.id) ?? null,
                }}
                colleagues={members.filter((o) => o.id !== m.id).map((o) => ({ id: o.id, name: memberName(o) }))}
                today={today}
              />
            ))}
          </ul>
        </Card>

        {seats ? (
          <p className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]">
            {seats.included} Logins sind inklusive, Sie nutzen {seats.used}.{" "}
            {seats.used > seats.included
              ? `${seats.used - seats.included} weitere ${seats.used - seats.included === 1 ? "Login kostet" : "Logins kosten"} je ${fmtSeat(seats.price)} im Monat.`
              : `Jeder weitere Login kostet ${fmtSeat(seats.price)} im Monat.`}
          </p>
        ) : null}

        <InviteForm readOnly={readOnly} costHint={seats && seats.used >= seats.included ? `Dieser Login kostet zusätzlich ${fmtSeat(seats.price)} im Monat, tagesgenau abgerechnet.` : null} />
      </div>
    </main>
  );
}

function fmtSeat(n: number): string {
  return `${n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 })} netto`;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
