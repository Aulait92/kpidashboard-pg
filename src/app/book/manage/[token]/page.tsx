import Link from "next/link";
import { redirect } from "next/navigation";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { a, asAnsprache, type Ansprache } from "@/lib/ansprache";
import { CheckCircle2, Video } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { AddToCalendar } from "@/components/add-to-calendar";
import { SubmitButton } from "@/components/submit-button";
import { type Slot } from "@/lib/calendar";
import { rescheduleSlots } from "@/lib/calendar/manage";
import { prisma } from "@/lib/prisma";
import { cancelManageAction, rescheduleManageAction } from "./actions";
import { nowMs } from "@/lib/now";

// Self-Service für den Lead: Termin ansehen, verschieben oder absagen.
// Erreichbar nur über den geheimen Link aus Bestätigung/Einladung/Erinnerung.
export const dynamic = "force-dynamic";
export const metadata = { title: "Termin verwalten", robots: { index: false, follow: false } };

const TZ = "Europe/Berlin";
function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);
}
const LONG: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
};

// Texte je Ansprache des Beraters (Ole, 14.11.2026: Standard Sie)
function errorsFor(an: Ansprache): Record<string, string> {
  return {
    slot: a(an, "Bitte wähle eine neue Uhrzeit aus.", "Bitte wählen Sie eine neue Uhrzeit aus."),
    taken: a(an, "Diese Uhrzeit ist gerade vergeben worden. Bitte wähle eine andere.", "Diese Uhrzeit ist gerade vergeben worden. Bitte wählen Sie eine andere."),
    busy: a(an, "Zu viele Anfragen in kurzer Zeit. Bitte versuche es in ein paar Minuten erneut.", "Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es in ein paar Minuten erneut."),
    error: a(an, "Das hat leider nicht geklappt. Bitte versuche es erneut.", "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut."),
  };
}

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; err?: string }>;
};

export default async function ManageAppointmentPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;

  const appt = await prisma.appointment.findUnique({
    where: { manageToken: token },
    select: {
      id: true,
      customerId: true,
      status: true,
      startsAt: true,
      endsAt: true,
      mode: true,
      meetUrl: true,
      leadId: true,
      conversationId: true,
      createdAt: true,
      calendarKey: true,
      customer: {
        select: { name: true, leadAddress: true, calendarConnection: { select: { bookingSlug: true } } },
      },
    },
  });

  if (!appt) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link ungültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Dieser Link ist nicht (mehr) gültig.
        </p>
      </Shell>
    );
  }

  // Team: Termin im Kalender eines Beraters → dessen Name.
  const advisorUserId = appt.calendarKey?.startsWith("user:") ? appt.calendarKey.slice(5) : null;
  const advisorUser = advisorUserId
    ? await prisma.user.findUnique({ where: { id: advisorUserId }, select: { displayName: true } })
    : null;
  const advisor = advisorUser?.displayName?.trim() || appt.customer.name;
  const slug = appt.customer.calendarConnection?.bookingSlug;
  const when = `${fmt(appt.startsAt, LONG)} Uhr`;
  const an = asAnsprache(appt.customer.leadAddress);
  const ERRORS = errorsFor(an);
  const kind = appt.mode === "video" ? "Videocall" : "Telefonat";

  // Alter Link nach dem Verschieben (neuer Termin, neuer Link): zum aktuellen Termin statt „abgesagt“,
  // sonst bucht der Lead womöglich doppelt (Runde 5, 16.11.2026).
  if (appt.status === "cancelled" && sp.done !== "cancelled") {
    const same = [
      ...(appt.leadId ? [{ leadId: appt.leadId }] : []),
      ...(appt.conversationId ? [{ conversationId: appt.conversationId }] : []),
    ];
    const current = same.length
      ? await prisma.appointment.findFirst({
          where: {
            customerId: appt.customerId,
            id: { not: appt.id },
            status: "booked",
            startsAt: { gt: new Date(nowMs()) },
            createdAt: { gte: appt.createdAt },
            manageToken: { not: null },
            OR: same,
          },
          orderBy: { createdAt: "desc" },
          select: { manageToken: true },
        })
      : null;
    if (current?.manageToken) redirect(`/book/manage/${current.manageToken}?done=aktuell`);
  }

  if (appt.status === "cancelled") {
    return (
      <Shell customerId={appt.customerId}>
        <h1 className="text-xl font-bold">
          {sp.done === "cancelled" ? a(an, "Dein Termin ist abgesagt", "Ihr Termin ist abgesagt") : "Dieser Termin wurde abgesagt"}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {kind} mit {advisor} am {when}. Alle Teilnehmer wurden informiert.
        </p>
        {slug ? (
          <Link
            href={`/book/${slug}`}
            className={buttonClass("primary", "md", "mt-5 w-full")}
          >
            Neuen Termin wählen
          </Link>
        ) : null}
      </Shell>
    );
  }

  if (appt.startsAt.getTime() <= nowMs()) {
    return (
      <Shell customerId={appt.customerId}>
        <h1 className="text-xl font-bold">Termin liegt in der Vergangenheit</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {kind} mit {advisor} am {when}.
        </p>
      </Shell>
    );
  }

  let slots: Slot[] = [];
  try {
    // Verschieben behält die Dauer des Termins
    slots = await rescheduleSlots(appt);
  } catch (err) {
    console.error("[manage page] slots", err);
  }
  const days = new Map<string, Slot[]>();
  for (const s of slots) {
    const label = fmt(new Date(s.start), { weekday: "long", day: "numeric", month: "long" });
    days.set(label, [...(days.get(label) ?? []), s]);
  }
  const error = sp.err ? (ERRORS[sp.err] ?? ERRORS.error) : null;

  return (
    <Shell customerId={appt.customerId}>
      {sp.done === "aktuell" ? (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand-soft,#eff6ff)] px-3 py-2 text-sm ring-1 ring-[color:var(--border)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" /> {a(an, "Dein Termin wurde verschoben. Das ist die aktuelle Zeit.", "Ihr Termin wurde verschoben. Das ist die aktuelle Zeit.")}
        </div>
      ) : null}
      {sp.done === "rescheduled" ? (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {a(an, "Dein Termin wurde verschoben. Trag die neue Zeit am besten gleich in deinen Kalender ein.", "Ihr Termin wurde verschoben. Tragen Sie die neue Zeit am besten gleich in Ihren Kalender ein.")}
        </div>
      ) : null}
      <h1 className="text-xl font-semibold leading-tight tracking-tight">{a(an, "Dein", "Ihr")} Termin mit {advisor}</h1>
      <div className="mt-3 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
        <div className="text-sm text-[color:var(--muted)]">{kind}</div>
        <div className="mt-1 text-lg font-semibold">{when}</div>
        {appt.mode === "video" && appt.meetUrl ? (
          <a href={appt.meetUrl} className={buttonClass("primary", "sm", "mt-3")}>
            <Video className="h-3.5 w-3.5" /> Zum Videocall
          </a>
        ) : null}
      </div>
      <AddToCalendar token={token} />

      {error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      ) : null}

      {/* Gerade verschoben: Bestätigung steht oben, Ändern nur noch auf Wunsch (Runde 5, 16.11.2026) */}
      <ChangeArea collapsed={sp.done === "rescheduled"}>
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Termin verschieben</h2>
          {days.size === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">
              Aktuell sind keine anderen Zeiten online verfügbar.
            </p>
          ) : (
            <form action={rescheduleManageAction.bind(null, token)} className="space-y-4">
              {[...days.entries()].map(([label, daySlots]) => (
                <div key={label}>
                  <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">{label}</div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {daySlots.map((s) => (
                      <label
                        key={s.start}
                        className="cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white py-2.5 text-center text-sm font-semibold tabular-nums transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand)] has-checked:text-white"
                      >
                        <input type="radio" name="start" value={s.start} required className="sr-only" />
                        {fmt(new Date(s.start), { hour: "2-digit", minute: "2-digit" })}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <SubmitButton
                pendingLabel="Wird verschoben …"
                className={buttonClass("primary", "md", "h-12 w-full text-base")}
              >
                Auf diese Zeit verschieben
              </SubmitButton>
            </form>
          )}
        </section>

        <section className="mt-8 border-t border-[color:var(--border)] pt-5">
          <h2 className="mb-2 text-sm font-semibold">Termin absagen</h2>
          <form action={cancelManageAction.bind(null, token)} className="space-y-3">
            <label className="flex cursor-pointer items-start gap-2.5 py-1 text-sm text-[color:var(--muted)]">
              <input type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0" />
              Ja, ich möchte den Termin am {when} absagen.
            </label>
            <SubmitButton
              pendingLabel="Wird abgesagt …"
              className={buttonClass("danger", "md", "w-full")}
            >
              Termin absagen
            </SubmitButton>
          </form>
        </section>
      </ChangeArea>
    </Shell>
  );
}

function ChangeArea({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (!collapsed) return <>{children}</>;
  return (
    <details className="group mt-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--border)] text-sm font-medium text-[color:var(--muted)] group-open:hidden">
        Andere Zeit wählen oder absagen
      </summary>
      {children}
    </details>
  );
}

function Shell({ children, customerId }: { children: React.ReactNode; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">
          {children}
        </div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}
