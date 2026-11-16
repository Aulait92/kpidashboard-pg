import Link from "next/link";
import { connection } from "next/server";
import { CalendarDays, CheckCircle2, ExternalLink, Settings, Video } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui";
import { CopyField } from "@/components/termin/copy-field";
import { AdminRescheduleButton } from "@/components/termin/admin-termin";
import { Seite } from "@/components/admin-neu/ui/seite";
import { kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { TerminBuchen } from "@/components/admin-neu/vertrieb/termin-buchen";
import { adminRescheduleTerminAction, disconnectSalesCalendarAction } from "@/app/admin/vertrieb/buchungsseite/actions";
import { PROVIDER_LABELS } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { DEFAULT_BOOKING_TYPE, VERTRIEB_CUSTOMER_ID, bookingPath, publicSalesBookingUrl, salesAppUrl } from "@/lib/vertrieb/buchung";
import { shortName } from "@/lib/vertrieb/crm";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import { waConfirmLabel } from "@/lib/vertrieb/kontaktakte";

export const metadata = { title: "Termine | performancegrowth Admin" };

const TZ = "Europe/Berlin";
const tagLabel = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(d);
const uhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const tagKey = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);

// Vertrieb → Termine: kommende Vertriebstermine (eigene Buchungsseite, Calendly, von Hand gebucht) mit Meeting-Link
// und „Verschieben“, daneben die Buchungslinks zum Kopieren und der Kalender. Einstellungen der Buchungsseiten
// (Dauer, Zeiten, Einbinden) liegen unter Einstellungen → Buchungsseiten.
// „Termin buchen“: Kontakt wählen, dann das bestehende Fenster in der Kontaktakte (auch über „+ Neu → Termin“).
export default async function TerminePage({ searchParams }: { searchParams: Promise<{ buchen?: string }> }) {
  await connection();
  await requireAuth();
  const { buchen } = await searchParams;
  const heute = new Date(`${tagKey(new Date())}T00:00:00`);
  const [meetings, conn, types] = await Promise.all([
    prisma.salesMeeting.findMany({
      where: { status: "GEPLANT", startAt: { gte: new Date(heute.getTime() - 12 * 3600_000) } },
      orderBy: { startAt: "asc" },
      take: 60,
      select: {
        id: true, title: true, startAt: true, endAt: true, joinUrl: true, location: true, inviteeName: true, bookingTypeId: true, manageToken: true,
        waConfirmStatus: true, contact: { select: { id: true, name: true } },
      },
    }),
    prisma.calendarConnection.findUnique({ where: { customerId: VERTRIEB_CUSTOMER_ID }, select: { status: true, provider: true, accountEmail: true } }),
    prisma.salesBookingType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, slug: true, title: true, durationMin: true, bookingWindowDays: true } }),
  ]);
  const jetzt = new Date();
  const kommend = meetings.filter((m) => (m.endAt ?? new Date(m.startAt.getTime() + 3600_000)) >= jetzt);
  const tage = [...new Set(kommend.map((m) => tagKey(m.startAt)))];
  const connected = conn?.status === "connected";
  const connect = (provider: "google" | "microsoft") => `/api/${provider}/connect?customerId=${VERTRIEB_CUSTOMER_ID}&zurueck=buchungsseite`;
  // Einstellungen → Buchungsseiten (dieselbe alte Seite wie dieser Reiter, deshalb fester Pfad statt Umzug)
  const einstellungen = "/admin/neu/einstellungen/buchungsseiten";

  return (
    <Seite titel="Vertrieb" reiter="vertrieb" aktionen={<TerminBuchen offen={!!buchen} key={buchen ?? "zu"} />}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
        <Card>
          <CardHeader title="Kommende Termine" count={kommend.length} icon={CalendarDays} />
          {kommend.length ? (
            <div data-funktion="page-termine--termine-calendly-bzw-buchungsseite-mit-meeting">
              {tage.map((t) => (
                <section key={t}>
                  <h3 className="bg-[color:var(--surface-sunken)] px-5 py-1.5 text-xs font-semibold text-[color:var(--muted)]">{tagLabel(new Date(`${t}T12:00:00Z`))}</h3>
                  <ul className="divide-y divide-[color:var(--border)]">
                    {kommend
                      .filter((m) => tagKey(m.startAt) === t)
                      .map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                          <span className="w-12 shrink-0 font-semibold tabular-nums">{uhr(m.startAt)}</span>
                          <Link href={kontaktPfad(m.contact.id)} className="min-w-0 flex-1">
                            <span className="block truncate font-medium hover:underline">{shortName(m.contact.name)}</span>
                            <span className="block truncate text-xs text-[color:var(--muted)]">
                              {m.title}
                              {m.waConfirmStatus ? ` · WhatsApp-Bestätigung ${waConfirmLabel(m.waConfirmStatus)}` : ""}
                            </span>
                          </Link>
                          <span className="flex items-center gap-2">
                            {m.joinUrl ? (
                              <a href={m.joinUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
                                <Video className="h-3.5 w-3.5" /> Meeting
                              </a>
                            ) : m.location ? (
                              <span className="text-xs text-[color:var(--muted)]">{m.location}</span>
                            ) : null}
                            {m.bookingTypeId && m.manageToken ? (
                              <AdminRescheduleButton action={adminRescheduleTerminAction} meetingId={m.id} title={`${m.title}, ${fmtDateTime(m.startAt)}`} startAt={m.startAt.toISOString()} />
                            ) : null}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="Keine Termine geplant." text="Buchungslink schicken oder selbst einen Termin buchen." action={<TerminBuchen />} />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Buchungsseiten"
            actions={
              <ButtonLink href={einstellungen} variant="ghost" icon={Settings}>
                Einstellungen
              </ButtonLink>
            }
          />
          <ul className="divide-y divide-[color:var(--border)]" data-funktion="page--buchungslink-kopieren">
            {types.map((t) => (
              <li key={t.id} className="space-y-2 px-5 py-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{t.title.replace(/\s+mit\s+.+$/, "")}</span>
                  <span className="text-xs text-[color:var(--muted)]">
                    {t.durationMin} Min. · {t.bookingWindowDays} Tage im Voraus
                  </span>
                </div>
                <CopyField value={t.slug === DEFAULT_BOOKING_TYPE ? publicSalesBookingUrl() : salesAppUrl(bookingPath(t.slug))} label="Link kopieren" />
                {t.slug !== DEFAULT_BOOKING_TYPE ? <p className="text-xs text-[color:var(--muted)]">Persönlicher Link je Kontakt: Kontaktakte → Termin buchen.</p> : null}
              </li>
            ))}
            {!types.length ? <li className="px-5 py-4 text-sm text-[color:var(--muted)]">Keine Buchungsseite aktiv.</li> : null}
          </ul>
          <div className="border-t border-[color:var(--border)] px-5 py-4 text-sm" data-funktion="actions-disconnectsalescalendaraction--vertriebskalender-verbinden-bzw-trennen">
            {connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="min-w-0 flex-1">
                  Kalender: {PROVIDER_LABELS[conn!.provider] ?? conn!.provider} verbunden{conn!.accountEmail ? ` (${conn!.accountEmail})` : ""}
                </span>
                <form action={disconnectSalesCalendarAction}>
                  <button type="submit" className="min-h-10 text-sm text-[color:var(--muted)] underline">
                    Trennen
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge tone="warning">Kalender nicht verbunden</Badge>
                  <span className="text-xs text-[color:var(--muted)]">Ohne Kalender keine freien Zeiten.</span>
                </div>
                <div className="grid gap-2">
                  <a href={connect("google")} className={buttonClass("secondary", "md")}>
                    Google-Kalender verbinden
                  </a>
                  <a href={connect("microsoft")} className={buttonClass("secondary", "md")}>
                    Outlook verbinden
                  </a>
                </div>
              </div>
            )}
            {connected ? (
              <a href="/termin" target="_blank" rel="noopener" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:underline">
                <ExternalLink className="h-4 w-4" /> Buchungsseite ansehen
              </a>
            ) : null}
          </div>
        </Card>
      </div>
    </Seite>
  );
}
