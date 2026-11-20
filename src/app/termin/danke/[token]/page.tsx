import { connection } from "next/server";
import { CheckCircle2 } from "lucide-react";
import { TerminShell } from "@/components/termin/termin-shell";
import { Vorbereitung } from "@/components/termin/vorbereitung";
import { meetingByToken, PREPARATION_YOUTUBE_ID, publicSalesBookingUrl } from "@/lib/vertrieb/buchung";
import { recordPreparationAction } from "../../actions";
import { terminMetadata } from "../../booking-page";

export const metadata = { ...terminMetadata, title: "Vielen Dank · performancegrowth" };

const TZ = "Europe/Berlin";

// Danke-Seite nach dem Meta-Leads-Call (auch aus der Bestätigungsmail verlinkt): Vorbereitungsvideo (YouTube).
export default async function TerminDankePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ einbetten?: string; gebucht?: string }>;
}) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const embed = sp.einbetten === "1";
  const m = await meetingByToken(token);
  if (!m) {
    return (
      <TerminShell embed={embed}>
        <h1 className="text-xl font-semibold">Link ungültig</h1>
        <a href={publicSalesBookingUrl()} target="_top" className="mt-4 inline-flex h-11 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white">
          Termin wählen
        </a>
      </TerminShell>
    );
  }
  const when = `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(m.startAt)} Uhr`;
  const q = embed ? "?einbetten=1" : "";
  return (
    <TerminShell embed={embed} booked={!!sp.gebucht}>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{m.status === "GEPLANT" ? "Vielen Dank, Ihr Termin steht" : "Vielen Dank"}</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            {m.title}, {when}
          </p>
        </div>
      </div>
      {m.bookingType?.confirmText ? <p className="mt-5 text-sm leading-relaxed">{m.bookingType.confirmText}</p> : null}
      <div className="mt-4">
        <Vorbereitung youtubeId={PREPARATION_YOUTUBE_ID} onWatched={recordPreparationAction.bind(null, token, "video")} />
      </div>
      <a href={`/termin/verwalten/${token}${q}`} className="mt-5 block text-center text-sm text-[color:var(--muted)] underline">
        Termin verschieben oder absagen
      </a>
    </TerminShell>
  );
}
