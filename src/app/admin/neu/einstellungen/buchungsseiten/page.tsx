import { CalendarDays, CheckCircle2, ExternalLink, ChevronDown } from "lucide-react";
import { disconnectSalesCalendarAction, saveBookingTypeAction, saveBusyCalendarsAction, saveSalesTimesAction } from "@/app/admin/vertrieb/buchungsseite/actions";
import { BusyCalendarsForm } from "@/components/termin/busy-calendars-form";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { LeadTimesForm } from "@/components/calendar-sources";
import { BookingTypeForm } from "@/components/termin/booking-type-form";
import { CopyField } from "@/components/termin/copy-field";
import { ButtonLink, Card, CardHeader, buttonClass } from "@/components/ui";
import { PROVIDER_LABELS } from "@/lib/calendar";
import { loadLeadTimes } from "@/lib/calendar/lead-times";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import {
  BUFFER_CHOICES,
  DEFAULT_BOOKING_TYPE,
  DURATION_CHOICES,
  NOTICE_CHOICES,
  VERTRIEB_CUSTOMER_ID,
  WINDOW_CHOICES,
  bookingPath,
  bookingTypeHint,
  embedSnippet,
  publicSalesBookingUrl,
  salesAppUrl,
} from "@/lib/vertrieb/buchung";

export const metadata = { title: "Buchungsseiten | performancegrowth Admin" };

// Buchungsseiten (Demo „e-buchung“, heute /admin/vertrieb/buchungsseite „Meine Buchungsseite“): Kalender, je Termintyp
// Link und Einstellungen (Dauer, Puffer, Vorlauf, Fenster), buchbare Zeiten, Einbettungscode eingeklappt. Bausteine und
// Server Actions wie heute. Termine selbst stehen unter Vertrieb → Termine.
export default async function Page({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const [conn, types, lt] = await Promise.all([
    prisma.calendarConnection.findUnique({ where: { customerId: VERTRIEB_CUSTOMER_ID }, select: { status: true, provider: true, accountEmail: true, busyCalendarIds: true, busyCalendarErrors: true } }),
    prisma.salesBookingType.findMany({ orderBy: { sortOrder: "asc" } }),
    loadLeadTimes(VERTRIEB_CUSTOMER_ID),
  ]);
  const connected = conn?.status === "connected";
  const main = types.find((t) => t.slug === DEFAULT_BOOKING_TYPE);
  const connect = (provider: "google" | "microsoft") => `/api/${provider}/connect?customerId=${VERTRIEB_CUSTOMER_ID}&zurueck=buchungsseite`;

  return (
    <EinstellungSeite
      pfad="/admin/neu/einstellungen/buchungsseiten"
      breit
      aktionen={
        connected ? (
          <ButtonLink href="/termin" external icon={ExternalLink}>
            Seite ansehen
          </ButtonLink>
        ) : null
      }
    >
      {sp.gcal && sp.gcal !== "connected" ? (
        <p className="rounded-[var(--radius-md)] bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">Der Kalender konnte nicht verbunden werden. Bitte erneut versuchen.</p>
      ) : null}

      <Card>
        <CardHeader title="Kalender" icon={CalendarDays} />
        {/* Admin-Umbau 19.11.2026 (Verkaufen): Kalender und Buchungslinks nur noch hier, nicht mehr doppelt unter Verkaufen → Termine */}
        <div className="p-5 text-sm" data-funktion="actions-disconnectsalescalendaraction--vertriebskalender-verbinden-bzw-trennen">
          {connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="min-w-0 flex-1">
                {PROVIDER_LABELS[conn!.provider] ?? conn!.provider} verbunden{conn!.accountEmail ? `: ${conn!.accountEmail}` : ""}
              </span>
              <form action={disconnectSalesCalendarAction}>
                <button type="submit" className="min-h-10 text-sm text-[color:var(--muted)] underline">
                  Trennen
                </button>
              </form>
              {conn!.provider === "google" ? (
                <div className="basis-full">
                  <BusyCalendarsForm action={saveBusyCalendarsAction} ids={conn!.busyCalendarIds} unlesbar={conn!.busyCalendarErrors.filter((id) => conn!.busyCalendarIds.includes(id))} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[color:var(--muted)]">Freie Zeiten kommen aus Ihrem Kalender, gebuchte Termine landen dort mit Meet- bzw. Teams-Link.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <a href={connect("google")} className={buttonClass("primary", "md")}>
                  Google-Kalender verbinden
                </a>
                <a href={connect("microsoft")} className={buttonClass("secondary", "md")}>
                  Outlook verbinden
                </a>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className={`grid grid-cols-1 gap-5 ${types.length > 1 ? "lg:grid-cols-2" : ""}`} data-funktion="actions-savebookingtypeaction--termintypen-bearbeiten-dauer-puffer-vorlauf">
        {types.map((t) => (
          <Card key={t.id}>
            <CardHeader title={t.title} hint={bookingTypeHint(t)} />
            <div className="space-y-4 p-5">
              {t.active ? (
                <div data-funktion="page--buchungslink-kopieren">
                  <CopyField value={t.slug === DEFAULT_BOOKING_TYPE ? publicSalesBookingUrl() : salesAppUrl(bookingPath(t.slug))} />
                </div>
              ) : null}
              <BookingTypeForm action={saveBookingTypeAction} type={t} durations={DURATION_CHOICES} buffers={BUFFER_CHOICES} notices={NOTICE_CHOICES} windows={WINDOW_CHOICES} />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Buchbare Zeiten" />
        <div className="p-5" data-funktion="actions-savesalestimesaction--buchbare-zeiten-je-wochentag">
          <LeadTimesForm initial={lt} action={saveSalesTimesAction} readOnly={false} fixedDuration={main?.durationMin ?? 45} />
        </div>
      </Card>

      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]" data-funktion="page-embedsnippet--einbettungscode-fuer-die-webseite-kopieren">
        <summary className="flex min-h-12 cursor-pointer list-none [&::-webkit-details-marker]:hidden items-center px-5 text-[15px] font-semibold">Auf der Webseite einbinden<ChevronDown className="ml-auto h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
        <div className="space-y-3 border-t border-[color:var(--border)] p-5">
          <p className="text-sm text-[color:var(--muted)]">Code für performancegrowth.de/termin. Die Höhe passt sich automatisch an.</p>
          <CopyField value={embedSnippet()} multiline label="Code kopieren" />
        </div>
      </details>
    </EinstellungSeite>
  );
}
