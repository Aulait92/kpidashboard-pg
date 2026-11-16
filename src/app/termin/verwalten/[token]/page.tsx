import { connection } from "next/server";
import { CheckCircle2, Video, XCircle } from "lucide-react";
import { TerminShell } from "@/components/termin/termin-shell";
import { TerminForm } from "@/components/termin/termin-form";
import { availableSlots, isOpenMeeting, meetingByToken, publicSalesBookingUrl } from "@/lib/vertrieb/buchung";
import { cancelTerminAction, rescheduleTerminAction } from "../../actions";
import { slotsToDays, terminMetadata } from "../../booking-page";

export const metadata = { ...terminMetadata, title: "Termin verwalten · performancegrowth" };

const TZ = "Europe/Berlin";
const when = (d: Date) =>
  `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d)} Uhr`;

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ einbetten?: string; gebucht?: string; verschoben?: string; abgesagt?: string; fehler?: string }>;
};

// Termin verwalten (Link aus Bestätigung, E-Mail und WhatsApp): verschieben oder absagen, ohne Login.
export default async function TerminVerwaltenPage({ params, searchParams }: Props) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const embed = sp.einbetten === "1";
  const m = await meetingByToken(token);
  const newBooking = (
    <a href={publicSalesBookingUrl()} target="_top" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white">
      Neuen Termin wählen
    </a>
  );
  if (!m) {
    return (
      <TerminShell embed={embed}>
        <h1 className="text-xl font-semibold">Link ungültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Diesen Termin finden wir nicht. Bitte nutzen Sie den Link aus Ihrer Bestätigung.</p>
        {newBooking}
      </TerminShell>
    );
  }
  if (m.status === "ABGESAGT" || m.status === "VERSCHOBEN") {
    return (
      <TerminShell embed={embed}>
        <XCircle className="h-10 w-10 text-[color:var(--muted)]" />
        <h1 className="mt-3 text-xl font-semibold">{m.status === "ABGESAGT" ? "Ihr Termin ist abgesagt" : "Dieser Termin wurde verschoben"}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {m.status === "ABGESAGT" ? `${m.title} am ${when(m.startAt)}.` : "Den neuen Termin finden Sie in der neuesten Bestätigung."}
        </p>
        {m.status === "ABGESAGT" ? newBooking : null}
      </TerminShell>
    );
  }
  const open = isOpenMeeting(m);
  const heading = sp.gebucht ? "Ihr Termin ist gebucht" : sp.verschoben ? "Ihr Termin ist verschoben" : open ? "Ihr Termin" : "Dieser Termin ist vorbei";
  const days = open && m.bookingType ? slotsToDays(await availableSlots(m.bookingType).catch(() => [])) : [];
  const hidden = { token, ...(embed ? { einbetten: "1" } : {}) };

  return (
    <TerminShell embed={embed} booked={!!sp.gebucht || !!sp.verschoben}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">{heading}</h1>
      <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--background)] p-4">
        <div className="text-sm text-[color:var(--muted)]">{m.title}</div>
        <div className="mt-1 text-lg font-semibold">{when(m.startAt)}</div>
      </div>
      {sp.gebucht && m.bookingType?.confirmText ? <p className="mt-4 text-sm leading-relaxed">{m.bookingType.confirmText}</p> : null}
      {sp.gebucht || sp.verschoben ? <p className="mt-3 text-sm text-[color:var(--muted)]">Die Bestätigung kommt per E-Mail, die Einladung in Ihren Kalender.</p> : null}
      {open && m.joinUrl ? (
        <a href={m.joinUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white">
          <Video className="h-4 w-4" /> Zum Videocall
        </a>
      ) : null}
      {open && m.bookingType?.thanksPage ? (
        <a href={`/termin/danke/${token}${embed ? "?einbetten=1" : ""}`} className="mt-3 block text-center text-sm font-semibold text-[color:var(--brand)] underline">
          Vorbereitungsvideo ansehen
        </a>
      ) : null}
      {sp.fehler ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">Das hat nicht geklappt. Bitte versuchen Sie es erneut.</p> : null}

      {open ? (
        <div className="mt-6 divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
          <details className="group py-3" data-verschieben>
            <summary className="cursor-pointer list-none py-1 text-sm font-semibold text-[color:var(--brand)]">Termin verschieben</summary>
            <div className="mt-3">
              {days.length ? (
                <TerminForm action={rescheduleTerminAction} days={days} hidden={hidden} fields={false} submitLabel="Neue Zeit bestätigen" />
              ) : (
                <p className="text-sm text-[color:var(--muted)]">Gerade sind keine anderen Zeiten frei. Antworten Sie gern auf die Bestätigung, wir finden einen Termin.</p>
              )}
            </div>
          </details>
          <details className="py-3" data-absagen>
            <summary className="cursor-pointer list-none py-1 text-sm font-semibold text-[color:var(--muted)]">Termin absagen</summary>
            <form action={cancelTerminAction} className="mt-3 space-y-3">
              {Object.entries(hidden).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">Grund (optional)</span>
                <textarea name="reason" rows={2} maxLength={500} className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-base" />
              </label>
              <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-sm)] border border-red-200 bg-white px-5 font-semibold text-red-700">
                Termin absagen
              </button>
            </form>
          </details>
        </div>
      ) : null}
    </TerminShell>
  );
}
