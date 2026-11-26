import { redirect } from "next/navigation";
import { Ban, CalendarDays, CheckCircle2, Clock, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { getOrCreateBookingSlug, PROVIDER_LABELS } from "@/lib/calendar";
import { BookingLinkCard } from "@/components/booking-link-card";
import { MicrosoftAdminConsent } from "@/components/microsoft-admin-consent";
import { microsoftAdminConsentUrl } from "@/lib/microsoft-admin-consent";
import { bookingPageUrl } from "@/lib/public-url";
import { prisma } from "@/lib/prisma";
import { vertriebFuer } from "@/lib/tarifauswahl-server";
import { disconnectOwnCalendarAction } from "./actions";
import { BeraterAllianzForm, BlockTimes, LeadTimesForm, RemindButton, SourcePicker, VideoRaumForm } from "@/components/calendar-sources";
import { loadBeraterPersonen } from "@/lib/calendar/berater-allianz";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import { loadTeamCalendars, providerLabel } from "@/lib/calendar/team";
import { terminAdresseFuer } from "@/lib/calendar/termin-weiterleitung-server";
import {
  addBlockAction,
  adoptOwnCalendarAction,
  connectAllianzAction,
  deleteBlockAction,
  disconnectAllianzAction,
  disconnectNativeCalendarAction,
  ohneOnlineKalenderAction,
  remindAdvisorCalendarAction,
  removeIcsAction,
  saveBeraterAllianzAction,
  saveIcsAction,
  saveLeadTimesAction,
  saveVideoRaumAction,
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
  const [own, customer, team, personen] = await Promise.all([
    ctx.userId
      ? prisma.advisorCalendar.findUnique({ where: { userId: ctx.userId }, select: { status: true, provider: true, accountEmail: true, allianzResourceId: true } })
      : null,
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { vermittlerTyp: true } }),
    owner ? loadTeamCalendars(ctx.customerId) : null,
    // Berater einer Agentur mit Allianz-Online-Kalender: Termine per Einladung an die Allianz-Adresse (21.11.2026)
    owner ? null : loadBeraterPersonen(ctx.customerId),
  ]);
  const ownConnected = own?.status === "connected";
  const ownApp = own?.provider === "app";
  const person = ownApp ? (personen?.resources.find((r) => r.id === own?.allianzResourceId) ?? null) : null;
  const makler = customer?.vermittlerTyp === "makler";
  // W2 wie in der Einrichtung (Ole, 22.11.2026): Allianz-Online-Kalender nur, wenn Allianz möglich ist. Gesellschaften bekannt
  // und keine davon die Allianz: weg; unbekannt: anbieten; schon verbunden bleibt sichtbar (SourcePicker).
  const gesellschaften = makler ? [] : ((await vertriebFuer(ctx.customerId).catch(() => null))?.vertrieb.gesellschaften ?? []);
  const allianzKalender = !makler && (!gesellschaften.length || gesellschaften.some((g) => /allianz/i.test(g)));
  // Inhaber: Kalender des Kundenkontos. Berater: eigener (nur wenn verbunden gibt es Lead-Zeiten/Blockierungen).
  const key = owner ? ctx.customerId : ownConnected ? userCalendarKey(ctx.userId!) : null;
  const setup = key ? await loadCalendarSetup(ctx.customerId, key) : null;
  const mainConnected = !!setup?.status.native.connected;
  // App-Kalender (kein Google/Outlook): Outlook-Termine per Weiterleitung blockieren (Ole, 21.11.2026)
  const terminAdresse = owner && setup?.status.native.app && key ? await terminAdresseFuer(key, ctx.customerId) : null;
  // Buchungsseite des Kundenkontos (Slug entsteht mit der Kalender-Verbindung des Kontos)
  const hasConnection = !!(await prisma.calendarConnection.findUnique({ where: { customerId: ctx.customerId }, select: { id: true } }));
  // Auf der eigenen Buchungsadresse (dein-beratungstermin.de/<slug>), sobald eingerichtet
  const slug = hasConnection ? await getOrCreateBookingSlug(ctx.customerId) : null;
  const bookingUrl = slug ? (bookingPageUrl(slug) ?? `/book/${slug}`) : null;
  const gcalNote =
    gcal === "connected" ? (
      <p className="mb-4 font-medium text-emerald-700">Kalender verbunden.</p>
    ) : gcal ? (
      <p className="mb-4 font-medium text-rose-700">
        {gcal === "consent"
          ? "Ihr Unternehmen muss die Verbindung erst freigeben. Bei Microsoft 365 hilft der Link unten, sonst melden Sie sich kurz bei uns."
          : "Das hat nicht geklappt. Bitte noch einmal versuchen."}
      </p>
    ) : null;
  const consentUrl = gcal === "consent" ? microsoftAdminConsentUrl() : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="Mein Kalender" subtitle="Termine für Ihre Leads direkt in Ihrem Kalender" />
      {gcalNote}
      {consentUrl ? <MicrosoftAdminConsent url={consentUrl} /> : null}

      {/* Erst verbinden, dann teilen: ohne Kalender steht die Buchungsseite unter „Ihr Kalender“ (16.11.2026) */}
      {mainConnected || ownConnected ? <BookingLinkCard url={bookingUrl} slug={slug} kannAendern={owner && !ro} calendarConnected /> : null}

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
                  allianzOption={allianzKalender}
                  ohneKalenderAction={ohneOnlineKalenderAction}
                  beratungszeiten={setup.beratungszeiten}
                  einladungAn={setup.einladungAn}
                />
              ) : null}
              {setup ? (
                <div className="mt-5 border-t border-[color:var(--border)] pt-4">
                  <VideoRaumForm action={saveVideoRaumAction} readOnly={ro} initial={setup.videoRoomUrl} weg={setup.videoWeg} teamsLinkFehlt={setup.teamsLinkFehlt} />
                </div>
              ) : null}
            </>
          ) : ownApp && ownConnected ? (
            <div className="space-y-3" data-berater-app>
              <p className="flex items-start gap-1.5 font-medium text-emerald-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Termine bekommen Sie als Einladung an {own!.accountEmail}
                  {person ? ` (${person.name} im Allianz-Online-Kalender)` : ""}.
                </span>
              </p>
              <details className="text-sm">
                <summary className="cursor-pointer text-[color:var(--muted)]">Ändern</summary>
                <div className="mt-3 space-y-4">
                  {personen ? (
                    <BeraterAllianzForm action={saveBeraterAllianzAction} resources={personen.resources} resourceId={own!.allianzResourceId} email={own!.accountEmail ?? ctx.email} readOnly={ro} />
                  ) : null}
                  <form action={disconnectOwnCalendarAction}>
                    <button className={buttonClass("ghost", "sm")} disabled={ro}>
                      Trennen
                    </button>
                  </form>
                </div>
              </details>
            </div>
          ) : !ownConnected && personen && personen.resources.length ? (
            <div className="space-y-4" data-berater-allianz-start>
              <div>
                <h3 className="text-[15px] font-semibold">Termine per Einladung an Ihre Allianz-Adresse</h3>
                <p className="mt-1 text-sm text-[color:var(--muted)]">
                  {ownApp ? "Ihre Person fehlt gerade im Allianz-Online-Kalender der Agentur. Bitte neu wählen." : "Wir buchen nur, wenn Sie im Allianz-Online-Kalender frei sind."}
                </p>
              </div>
              <BeraterAllianzForm action={saveBeraterAllianzAction} resources={personen.resources} resourceId={own?.allianzResourceId ?? null} email={own?.accountEmail ?? ctx.email} readOnly={ro} />
              <details className="text-sm">
                <summary className="cursor-pointer text-[color:var(--muted)]">Anderen Kalender verbinden</summary>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href="/api/google/connect?fuer=mich" className={buttonClass("secondary", "md", ro ? "pointer-events-none opacity-60" : "")}>
                    Google-Kalender verbinden
                  </a>
                  <a href="/api/microsoft/connect?fuer=mich" className={buttonClass("secondary", "md", ro ? "pointer-events-none opacity-60" : "")}>
                    Outlook / Microsoft 365 verbinden
                  </a>
                </div>
              </details>
            </div>
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
              <p className="text-sm text-[color:var(--muted)]" data-kalender-datenschutz>
                Wir lesen nur, wann Sie belegt sind, tragen gebuchte Termine ein und sehen bei diesen Terminen, ob der Lead zugesagt hat. Inhalte anderer Termine sehen und speichern wir nicht.
              </p>
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

      {!(mainConnected || ownConnected) ? (
        <div className="mt-5 [&>*]:mb-0">
          <BookingLinkCard url={bookingUrl} slug={slug} kannAendern={owner && !ro} calendarConnected={false} />
        </div>
      ) : null}

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
                      {r.owner ? <span className="ml-1.5 text-sm font-normal text-[color:var(--muted)]">Inhaber</span> : null}
                    </div>
                    <div className="truncate text-sm text-[color:var(--muted)]">
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
                    <span className="w-full text-sm text-[color:var(--muted)] sm:w-auto">
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
        // Eine Karte für die Zeiten (UX-Runde Team C, 19.11.2026): „Zeit blockieren“ ist die Ausnahme dazu, früher eigene Karte; „menus“: ohne overflow-hidden, damit die Speichern-Leiste kleben kann
        <Card id="beratungszeiten" className="mt-5 scroll-mt-20" menus>
          <CardHeader title="Wann dürfen Leads Termine buchen?" icon={Clock} />
          <div className="p-5">
            <p className="mb-4 text-sm text-[color:var(--muted)]">Unser Assistent schlägt nur diese Zeiten vor, und nur wenn Sie dann frei sind.</p>
            <LeadTimesForm initial={setup.leadTimes} action={saveLeadTimesAction} readOnly={ro} source={setup.source} nurBeiAenderung />
          </div>
          <div className="border-t border-[color:var(--border)] p-5" data-zeit-blockieren>
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Ban className="h-4 w-4 text-[color:var(--muted)]" /> Ausnahmen: Zeit blockieren
            </h3>
            <p className="mb-4 mt-1 text-sm text-[color:var(--muted)]">In diesen Zeiten bieten wir keine Termine an, auch wenn Ihr Kalender frei ist.</p>
            <BlockTimes blocks={setup.blocks} addAction={addBlockAction} deleteAction={deleteBlockAction} readOnly={ro} terminAdresse={terminAdresse} />
          </div>
        </Card>
      ) : !(mainConnected || ownConnected) ? null : (
        <p className="mt-5 text-sm text-[color:var(--muted)]">Sobald Ihr Kalender verbunden ist, können Sie hier Ihre Zeiten für Leads einstellen.</p>
      )}
    </main>
  );
}
