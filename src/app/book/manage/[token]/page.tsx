import Link from "next/link";
import { CheckCircle2, Video } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { AddToCalendar } from "@/components/add-to-calendar";
import { SubmitButton } from "@/components/submit-button";
import { suggestSlots, type Slot } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { cancelManageAction, rescheduleManageAction } from "./actions";

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

const ERRORS: Record<string, string> = {
  slot: "Bitte wähle eine neue Uhrzeit aus.",
  taken: "Diese Uhrzeit ist gerade vergeben worden. Bitte wähle eine andere.",
  error: "Das hat leider nicht geklappt. Bitte versuche es erneut.",
};

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
      mode: true,
      meetUrl: true,
      leadId: true,
      calendarKey: true,
      customer: {
        select: { name: true, calendarConnection: { select: { bookingSlug: true } } },
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
  const kind = appt.mode === "video" ? "Videocall" : "Telefonat";

  if (appt.status === "cancelled") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">
          {sp.done === "cancelled" ? "Dein Termin ist abgesagt" : "Dieser Termin wurde abgesagt"}
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

  if (appt.startsAt.getTime() <= Date.now()) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Termin liegt in der Vergangenheit</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {kind} mit {advisor} am {when}.
        </p>
      </Shell>
    );
  }

  let slots: Slot[] = [];
  try {
    slots = await suggestSlots(appt.customerId, 30, 24, [9, 10, 11, 13, 14, 15, 16, 17], 14, appt.leadId);
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
    <Shell>
      {sp.done === "rescheduled" ? (
        <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-sm)] bg-emerald-50 px-3 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> Dein Termin wurde verschoben. Trag die neue Zeit am besten gleich in deinen Kalender ein.
        </div>
      ) : null}
      <h1 className="text-xl font-semibold leading-tight tracking-tight">Dein Termin mit {advisor}</h1>
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
          <label className="flex items-start gap-2 text-xs text-[color:var(--muted)]">
            <input type="checkbox" required className="mt-0.5" />
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
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">
        {children}
      </div>
    </main>
  );
}
