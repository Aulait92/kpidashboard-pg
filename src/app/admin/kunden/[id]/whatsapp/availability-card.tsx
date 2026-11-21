import { CalendarDays } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { AllianzForm, AllianzTemplateForm, BeraterAllianzForm, BlockTimes, LeadTimesForm } from "@/components/calendar-sources";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import { loadBeraterPersonen } from "@/lib/calendar/berater-allianz";
import { prisma } from "@/lib/prisma";
import {
  adminAddBlockAction,
  adminChangeAllianzAction,
  adminConnectAllianzAction,
  adminDeleteBlockAction,
  adminDisconnectAllianzAction,
  adminSaveLeadTimesAction,
  adminSetBeraterAllianzAction,
} from "./calendar-actions";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

/** Kundenakte → Verfügbarkeit: Quellen, Allianz-Online-Kalender, Lead-Zeiten, Blockierungen. */
export async function AvailabilityCard({ customerId }: { customerId: string }) {
  const [setup, personen, berater] = await Promise.all([
    loadCalendarSetup(customerId, customerId),
    loadBeraterPersonen(customerId),
    prisma.user.findMany({
      where: { customerId, role: "BUYER", teamRole: "advisor" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, displayName: true, advisorCalendar: { select: { provider: true, status: true } } },
    }),
  ]);
  const a = setup.allianz;
  const hidden = { customerId };
  const sources = [
    setup.status.native.connected ? `Buchungskalender (${setup.status.native.label})` : "kein Buchungskalender",
    setup.status.hasIcs ? "ICS-Link" : null,
    a ? "Allianz-Online-Kalender" : null,
    "Lead-Zeiten",
    setup.blocks.length ? `${setup.blocks.length} Blockierung(en)` : null,
  ].filter(Boolean);

  return (
    <Card className="max-w-5xl">
      <CardHeader title="Verfügbarkeit" icon={CalendarDays} />
      <div className="grid grid-cols-1 gap-6 p-5 text-sm lg:grid-cols-2">
        <div className="space-y-4">
          <p className="text-[color:var(--muted)]">Quellen: {sources.join(" · ")}</p>
          {!setup.status.native.connected ? (
            <p className="font-medium text-rose-700">
              Ohne Buchungskalender (Google/Microsoft, oben unter „Buchungskalender“) kann der Assistent keine Termine vorschlagen oder eintragen.
            </p>
          ) : null}
          <div className="rounded-xl border border-[color:var(--border)] p-4">
            <div className="font-medium">Allianz-Online-Kalender</div>
            {a ? (
              <div className="mt-2 space-y-3">
                <p>
                  VTNR {a.vtnr}
                  {a.orgName ? ` · ${a.orgName}` : ""} · frühester Buchungstag: {a.bookingDayEarliest === 0 ? "heute" : `in ${a.bookingDayEarliest} Tagen`}
                  {setup.status.allianz?.abFruehestemTag ? " (davor schlägt die App keine Termine vor)" : a.bookingDayEarliest > 0 ? " (davor gelten die Lead-Zeiten, geprüft gegen den eigenen Kalender)" : ""}
                </p>
                <p className="text-xs text-[color:var(--muted)]">
                  Zustimmung: {a.consentAt ? fmt(a.consentAt) : "fehlt"} · letzter Abruf: {a.lastOkAt ? fmt(a.lastOkAt) : "noch keiner"}
                </p>
                {a.lastError ? <p className="font-medium text-rose-700">Letzter Fehler: {a.lastError}</p> : null}
                <AllianzTemplateForm
                  templates={a.templates}
                  resources={a.resources}
                  templateId={a.templateId}
                  resourceId={a.resourceId}
                  action={adminChangeAllianzAction}
                  hidden={hidden}
                />
                {/* Berater-App-Kalender (lib/calendar/berater-allianz.ts): Person je Mitglied, Termine per Einladung */}
                {personen && personen.resources.length && berater.length ? (
                  <div className="space-y-3 border-t border-[color:var(--border)] pt-3" data-admin-berater-allianz>
                    <div className="font-medium">Team: Person je Berater (Termine per Einladung)</div>
                    {berater.map((u) =>
                      u.advisorCalendar?.status === "connected" && u.advisorCalendar.provider !== "app" ? (
                        <p key={u.id} className="text-[color:var(--muted)]">
                          {u.displayName ?? u.email}: eigener Kalender verbunden
                        </p>
                      ) : (
                        <div key={u.id} className="rounded-lg bg-[color:var(--surface-sunken,#f8fafc)] p-3">
                          <BeraterAllianzForm
                            action={adminSetBeraterAllianzAction}
                            resources={personen.resources}
                            resourceId={personen.gewaehlt[u.id]?.resourceId ?? null}
                            email={personen.gewaehlt[u.id]?.email ?? u.email}
                            readOnly={false}
                            hidden={{ customerId, userId: u.id }}
                            frage={`${u.displayName ?? u.email}${personen.gewaehlt[u.id] && !personen.gewaehlt[u.id].connected ? " (ruht)" : ""}`}
                            kompakt
                          />
                        </div>
                      ),
                    )}
                  </div>
                ) : null}
                <form action={adminDisconnectAllianzAction}>
                  <input type="hidden" name="customerId" value={customerId} />
                  <button type="submit" className="text-sm text-rose-700 hover:underline">
                    Verbindung trennen
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-2">
                <AllianzForm action={adminConnectAllianzAction} readOnly={false} hidden={hidden} />
              </div>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <div>
            <div className="mb-2 font-medium">Wann dürfen Leads Termine buchen?</div>
            <LeadTimesForm initial={setup.leadTimes} action={adminSaveLeadTimesAction} readOnly={false} hidden={hidden} source={setup.source} />
          </div>
          <div>
            <div className="mb-2 font-medium">Zeit blockieren</div>
            <BlockTimes blocks={setup.blocks} addAction={adminAddBlockAction} deleteAction={adminDeleteBlockAction} readOnly={false} hidden={hidden} />
          </div>
        </div>
      </div>
    </Card>
  );
}
