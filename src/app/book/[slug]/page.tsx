import { prisma } from "@/lib/prisma";
import { SubmitButton } from "@/components/submit-button";
import { suggestSlots, type Slot } from "@/lib/whatsapp/google-calendar";
import { bookPublicAction } from "./actions";

// Öffentliche Buchungsseite je Kunde — z. B. als „Custom"-Scheduling-Link im
// Meta-Leadformular. Zeigt echte freie Zeiten aus dem Google-Kalender.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Termin buchen",
  robots: { index: false, follow: false },
};

const TZ = "Europe/Berlin";
const PRIVACY_URL =
  process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz";

const ERRORS: Record<string, string> = {
  slot: "Bitte wähle eine Uhrzeit aus.",
  name: "Bitte gib deinen Namen an.",
  phone: "Bitte gib eine gültige Telefonnummer an.",
  email: "Bitte gib eine gültige E-Mail-Adresse an.",
  consent: "Bitte bestätige die Datenschutzhinweise.",
  taken: "Diese Uhrzeit ist leider gerade vergeben worden — bitte wähle eine andere.",
  busy: "Gerade gehen sehr viele Buchungen ein. Bitte versuche es in ein paar Minuten erneut.",
  unavailable: "Die Online-Buchung ist aktuell nicht verfügbar.",
  invalid: "Die Buchung konnte nicht verarbeitet werden.",
  error: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
};

function fmt(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...opts }).format(d);
}

function groupByDay(slots: Slot[]): { label: string; slots: Slot[] }[] {
  const map = new Map<string, Slot[]>();
  for (const s of slots) {
    const label = fmt(new Date(s.start), {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    map.set(label, [...(map.get(label) ?? []), s]);
  }
  return [...map.entries()].map(([label, slots]) => ({ label, slots }));
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; a?: string; dup?: string; err?: string }>;
};

export default async function BookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { bookingSlug: slug },
    select: {
      customerId: true,
      status: true,
      customer: { select: { name: true } },
    },
  });

  if (!conn || conn.status !== "connected") {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Online-Buchung nicht verfügbar</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Dieser Buchungslink ist ungültig oder derzeit deaktiviert.
        </p>
      </Shell>
    );
  }

  const advisor = conn.customer.name;

  // ── Bestätigung ───────────────────────────────────────────────────────
  if (sp.ok && sp.a) {
    const appt = await prisma.appointment.findFirst({
      where: { id: sp.a, customerId: conn.customerId },
      select: { startsAt: true, mode: true, meetUrl: true },
    });
    if (appt) {
      return (
        <Shell>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">
            ✓
          </div>
          <h1 className="mt-4 text-xl font-bold">
            {sp.dup ? "Du hast bereits einen Termin" : "Dein Termin ist gebucht!"}
          </h1>
          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="text-sm text-[color:var(--muted)]">
              {appt.mode === "video" ? "Videocall" : "Telefonat"} mit {advisor}
            </div>
            <div className="mt-1 text-lg font-semibold">
              {fmt(appt.startsAt, {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              Uhr
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[color:var(--muted)]">
            {appt.mode === "video"
              ? "Die Einladung mit dem Link zum Videocall haben wir dir per E-Mail geschickt."
              : "Die Termineinladung haben wir dir per E-Mail geschickt. Wir rufen dich zur vereinbarten Zeit an."}
          </p>
          {appt.mode === "video" && appt.meetUrl ? (
            <a
              href={appt.meetUrl}
              className="mt-4 block rounded-xl bg-[color:var(--brand)] py-3 text-center text-sm font-semibold text-white"
            >
              Link zum Videocall
            </a>
          ) : null}
        </Shell>
      );
    }
  }

  // ── Buchungsformular ──────────────────────────────────────────────────
  let slots: Slot[] = [];
  try {
    slots = await suggestSlots(
      conn.customerId,
      30,
      24,
      [9, 10, 11, 13, 14, 15, 16, 17],
      14,
    );
  } catch (err) {
    console.error("[booking page] slots", err);
  }
  const days = groupByDay(slots);
  const action = bookPublicAction.bind(null, slug);
  const error = sp.err ? (ERRORS[sp.err] ?? ERRORS.error) : null;

  return (
    <Shell>
      <h1 className="text-xl font-bold leading-tight">
        Kostenloses Beratungsgespräch mit {advisor}
      </h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        30 Minuten · telefonisch oder per Videocall
      </p>

      {error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      ) : null}

      {days.length === 0 ? (
        <p className="mt-6 rounded-xl bg-[color:var(--background)] p-4 text-sm">
          Aktuell sind keine Termine online buchbar. Wir melden uns in Kürze
          bei dir, um einen Termin zu vereinbaren.
        </p>
      ) : (
        <form action={action} className="mt-6 space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold">1. Wähle eine Uhrzeit</h2>
            <div className="space-y-4">
              {days.map((day) => (
                <div key={day.label}>
                  <div className="mb-1.5 text-xs font-medium text-[color:var(--muted)]">
                    {day.label}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {day.slots.map((s) => (
                      <label
                        key={s.start}
                        className="cursor-pointer rounded-lg border border-[color:var(--border)] bg-white py-2.5 text-center text-sm font-semibold transition has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand)] has-checked:text-white"
                      >
                        <input
                          type="radio"
                          name="start"
                          value={s.start}
                          required
                          className="sr-only"
                        />
                        {fmt(new Date(s.start), { hour: "2-digit", minute: "2-digit" })}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">2. Wie möchtest du sprechen?</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "phone", label: "📞 Telefon" },
                { v: "video", label: "🎥 Videocall" },
              ].map((o, i) => (
                <label
                  key={o.v}
                  className="cursor-pointer rounded-lg border border-[color:var(--border)] bg-white py-3 text-center text-sm font-semibold transition has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand-soft)]"
                >
                  <input
                    type="radio"
                    name="mode"
                    value={o.v}
                    defaultChecked={i === 0}
                    className="sr-only"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">3. Deine Kontaktdaten</h2>
            <Field name="name" label="Vor- und Nachname" autoComplete="name" />
            <Field
              name="phone"
              label="Handynummer (für WhatsApp/Anruf)"
              type="tel"
              autoComplete="tel"
            />
            <Field name="email" label="E-Mail (für die Einladung)" type="email" autoComplete="email" />
            {/* Honeypot gegen Bots — für Menschen unsichtbar */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />
            <label className="flex items-start gap-2 text-xs leading-relaxed text-[color:var(--muted)]">
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>
                Ich bin einverstanden, dass meine Angaben zur Terminvereinbarung
                und Beratung verarbeitet werden. Hinweise in der{" "}
                <a
                  href={PRIVACY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Datenschutzerklärung
                </a>
                .
              </span>
            </label>
          </section>

          <SubmitButton
            pendingLabel="Wird gebucht …"
            className="w-full rounded-xl bg-[color:var(--brand)] py-3.5 text-base font-semibold text-white hover:bg-[color:var(--brand-dark)]"
          >
            Termin verbindlich buchen
          </SubmitButton>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_8px_24px_-12px_rgba(37,99,235,0.18)] sm:p-7">
        {children}
      </div>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  autoComplete,
}: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[color:var(--muted)]">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-[color:var(--border)] px-3 py-2.5 text-base focus:border-[color:var(--brand)] focus:outline-none"
      />
    </label>
  );
}
