import { redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { memberName, teamMembers } from "@/lib/team";
import { removeMemberAction, renameMemberAction, resendInviteAction, toggleReceivesLeadsAction } from "./actions";
import { InviteForm } from "./invite-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team | performancegrowth" };

const TZ = "Europe/Berlin";
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const small =
  "inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium hover:bg-[color:var(--background)] disabled:opacity-50";

export default async function TeamPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const readOnly = ctx.preview;

  const members = await teamMembers(ctx.customerId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const counts = await prisma.lead.groupBy({
    by: ["assignedUserId"],
    where: { customerId: ctx.customerId, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const leads30 = new Map(counts.map((c) => [c.assignedUserId, c._count._all]));
  const receivers = members.filter((m) => m.receivesLeads).length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Team" subtitle="Berater einladen und neue Leads gleichmäßig verteilen" />
      <div className="space-y-5">
        <Card>
          <CardHeader title="So funktioniert es" icon={UsersRound} />
          <div className="space-y-2 p-5 text-[15px] text-[color:var(--muted)]">
            <p>
              Jeder neue Lead geht an genau eine Person aus Ihrem Team, immer an die, die am längsten keinen bekommen hat. So
              bekommt jeder gleich viele.
            </p>
            <p>
              Berater sehen nur ihre eigenen Leads, Chats und Termine. Sie als Inhaber sehen alles und können Leads im Lead-Detail
              einer anderen Person zuteilen.
            </p>
            {members.length > 1 && receivers === 0 ? (
              <p className="font-medium text-amber-800">Gerade bekommt niemand neue Leads. Neue Leads sehen dann nur Sie.</p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title={`Mitglieder (${members.length})`} icon={UsersRound} />
          <ul className="divide-y divide-[color:var(--border)]">
            {members.map((m) => {
              const isMe = m.id === ctx.userId;
              const owner = m.teamRole !== "advisor";
              return (
                <li key={m.id} className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{memberName(m)}</span>
                    {isMe ? <Badge tone="neutral">Sie</Badge> : null}
                    <Badge tone={owner ? "success" : "neutral"}>{owner ? "Inhaber" : "Berater"}</Badge>
                    {m.receivesLeads ? <Badge tone="success">bekommt Leads</Badge> : <Badge tone="warning">keine neuen Leads</Badge>}
                  </div>
                  <div className="text-sm text-[color:var(--muted)]">
                    {m.email} · {leads30.get(m.id) ?? 0} {(leads30.get(m.id) ?? 0) === 1 ? "Lead" : "Leads"} in 30 Tagen ·{" "}
                    {m.lastLoginAt ? `zuletzt angemeldet ${date(m.lastLoginAt)}` : "noch nicht angemeldet"}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={toggleReceivesLeadsAction}>
                      <input type="hidden" name="userId" value={m.id} />
                      <button className={small} disabled={readOnly}>
                        {m.receivesLeads ? "Keine neuen Leads mehr" : "Wieder Leads zuteilen"}
                      </button>
                    </form>
                    <form action={renameMemberAction} className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={m.id} />
                      <input
                        name="name"
                        defaultValue={m.displayName ?? ""}
                        placeholder="Anzeigename"
                        className="h-9 w-40 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2.5 text-sm outline-none focus:border-[color:var(--brand)]"
                      />
                      <button className={small} disabled={readOnly}>
                        Speichern
                      </button>
                    </form>
                    {!owner ? (
                      <>
                        {!m.lastLoginAt ? (
                          <form action={resendInviteAction}>
                            <input type="hidden" name="userId" value={m.id} />
                            <button className={small} disabled={readOnly}>
                              Einladung erneut senden
                            </button>
                          </form>
                        ) : null}
                        <form action={removeMemberAction}>
                          <input type="hidden" name="userId" value={m.id} />
                          <button className={`${small} text-rose-700`} disabled={readOnly}>
                            Entfernen
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <InviteForm readOnly={readOnly} />
      </div>
    </main>
  );
}
