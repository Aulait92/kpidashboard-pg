import Link from "next/link";
import { CalendarDays, CheckCircle2, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { LeadTimesForm } from "@/components/calendar-sources";
import { CopyField } from "@/components/termin/copy-field";
import { BookingTypeForm } from "@/components/termin/booking-type-form";
import { loadLeadTimes } from "@/lib/calendar/lead-times";
import { PROVIDER_LABELS } from "@/lib/calendar";
import {
  BUFFER_CHOICES,
  DEFAULT_BOOKING_TYPE,
  DURATION_CHOICES,
  NOTICE_CHOICES,
  WINDOW_CHOICES,
  VERTRIEB_CUSTOMER_ID,
  bookingPath,
  embedSnippet,
  publicSalesBookingUrl,
  salesAppUrl,
} from "@/lib/vertrieb/buchung";
import { disconnectSalesCalendarAction, saveBookingTypeAction, saveSalesTimesAction } from "./actions";

export const metadata = { title: "Meine Buchungsseite | performancegrowth Admin" };

// Meine Buchungsseite (Ole, 16.11.2026): eigener Kalender und Zeiten für Vertriebstermine (/termin), ersetzt später Calendly.
export default async function BuchungsseitePage({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const [conn, types, lt] = await Promise.all([
    prisma.calendarConnection.findUnique({ where: { customerId: VERTRIEB_CUSTOMER_ID }, select: { status: true, provider: true, accountEmail: true } }),
    prisma.salesBookingType.findMany({ orderBy: { sortOrder: "asc" } }),
    loadLeadTimes(VERTRIEB_CUSTOMER_ID),
  ]);
  const connected = conn?.status === "connected";
  const main = types.find((t) => t.slug === DEFAULT_BOOKING_TYPE);
  const connect = (provider: "google" | "microsoft") => `/api/${provider}/connect?customerId=${VERTRIEB_CUSTOMER_ID}&zurueck=buchungsseite`;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meine Buchungsseite</h1>
          <p className="text-sm text-[color:var(--muted)]">Interessenten buchen Termine direkt in Ihrem Kalender.</p>
        </div>
        {connected ? (
          <a href="/termin" target="_blank" rel="noopener" className={buttonClass("primary", "md")}>
            <ExternalLink className="h-4 w-4" /> Seite ansehen
          </a>
        ) : null}
      </div>

      {sp.gcal && sp.gcal !== "connected" ? (
        <p className="rounded-[var(--radius-md)] bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">Der Kalender konnte nicht verbunden werden. Bitte erneut versuchen.</p>
      ) : null}

      <Card>
        <CardHeader title="Kalender" icon={CalendarDays} />
        <div className="space-y-3 p-5 text-sm">
          {connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="flex-1">
                {PROVIDER_LABELS[conn!.provider] ?? conn!.provider} verbunden{conn!.accountEmail ? `: ${conn!.accountEmail}` : ""}
              </span>
              <form action={disconnectSalesCalendarAction}>
                <button type="submit" className="text-sm text-[color:var(--muted)] underline">
                  Trennen
                </button>
              </form>
            </div>
          ) : (
            <>
              <p className="text-[color:var(--muted)]">Freie Zeiten kommen aus Ihrem Kalender, gebuchte Termine landen dort mit Meet- bzw. Teams-Link.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <a href={connect("google")} className={buttonClass("primary", "md")}>
                  Google-Kalender verbinden
                </a>
                <a href={connect("microsoft")} className={buttonClass("secondary", "md")}>
                  Outlook verbinden
                </a>
              </div>
            </>
          )}
        </div>
      </Card>

      {types.map((t) => {
        const url = t.slug === DEFAULT_BOOKING_TYPE ? publicSalesBookingUrl() : salesAppUrl(bookingPath(t.slug));
        return (
          <Card key={t.id}>
            <CardHeader title={t.title} hint={t.slug === DEFAULT_BOOKING_TYPE ? "Erstgespräch" : "Folgetermin nach dem Angebot, persönlicher Link im Vertriebskontakt"} />
            <div className="space-y-4 p-5">
              <CopyField value={url} />
              <BookingTypeForm action={saveBookingTypeAction} type={t} durations={DURATION_CHOICES} buffers={BUFFER_CHOICES} notices={NOTICE_CHOICES} windows={WINDOW_CHOICES} />
            </div>
          </Card>
        );
      })}

      <Card>
        <CardHeader title="Zeiten" />
        <div className="p-5">
          <LeadTimesForm initial={lt} action={saveSalesTimesAction} readOnly={false} fixedDuration={main?.durationMin ?? 45} />
        </div>
      </Card>

      <details className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold">Auf der Webseite einbinden</summary>
        <p className="mt-3 text-sm text-[color:var(--muted)]">Code für performancegrowth.de/termin. Die Höhe passt sich automatisch an.</p>
        <div className="mt-3">
          <CopyField value={embedSnippet()} multiline label="Code kopieren" />
        </div>
      </details>

      <p className="text-center text-xs text-[color:var(--muted)]">
        Gebuchte Termine erscheinen als Aufgabe im{" "}
        <Link href="/admin/heute/aufgaben" className="underline">
          Vertrieb
        </Link>
        . Calendly läuft parallel weiter.
      </p>
    </main>
  );
}
