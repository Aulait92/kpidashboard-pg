import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, CheckCircle2, Clock, PhoneCall, PhoneMissed } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import {
  istRueckmeldungArt,
  kurzName,
  naechsterWerktag9,
  RUECKMELDUNG_ARTEN,
  RUECKMELDUNG_LABEL,
  wiedervorlageText,
  type RueckmeldungArt,
} from "@/lib/ppl/rueckmeldung";
import { ladeRueckmeldungSeite } from "@/lib/ppl/rueckmeldung-server";
import { checkLimit, requestIp } from "@/lib/rate-limit";
import { rueckmeldungAction } from "./actions";

// Rückmeldung zu einem Pay-per-Lead aus der Liefer-E-Mail (Ole, 25.11.2026). Wer: der Käufer, am Handy, direkt nach dem
// Anruf, ohne Login. Aufgabe: sagen, wie es lief. Die gewählte Antwort aus der Mail ist vorausgewählt, ein Tipp auf
// „Speichern“ genügt (POST, damit Mail-Vorschauen nichts auslösen). Danach „Danke, gespeichert.“ mit „Ändern“.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rückmeldung | performancegrowth", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Search = { a?: string; ok?: string; fehler?: string };

const ICON: Record<RueckmeldungArt, typeof PhoneCall> = { erreicht: PhoneCall, nicht_erreicht: PhoneMissed, termin: CalendarCheck };
const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);

export default async function RueckmeldungPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Search> }) {
  const { token } = await params;
  const sp = await searchParams;
  if (!checkLimit("kaeuferRueckmeldung", `get:${await requestIp()}`).ok) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Zu viele Aufrufe in kurzer Zeit</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Bitte warten Sie einen Moment und öffnen Sie den Link dann erneut.</p>
      </Shell>
    );
  }
  const s = await ladeRueckmeldungSeite(token);
  if (!s.ok && s.grund === "ungueltig") notFound();
  if (!s.ok) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Dieser Link ist abgelaufen</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Tragen Sie die Rückmeldung bitte im Kundenbereich ein.</p>
        <Link href="/buyer" className={buttonClass("primary", "md", "mt-5 h-12 w-full text-base")}>
          Zum Kundenbereich
        </Link>
      </Shell>
    );
  }

  const name = kurzName(s.name);
  const kopf = (
    <div>
      <div className="text-xs font-medium text-[color:var(--muted)]">Rückmeldung zu Ihrem Lead</div>
      <div className="mt-0.5 text-xl font-semibold tracking-tight" data-rueckmeldung-name>
        {name}
      </div>
      <div className="mt-0.5 text-sm text-[color:var(--muted)]">
        {[s.produkt, `eingegangen am ${datum(s.eingang)}`].filter(Boolean).join(" · ")}
      </div>
    </div>
  );

  // ── Bestätigung ───────────────────────────────────────────────────────
  if (istRueckmeldungArt(sp.ok) && s.aktuell === sp.ok) {
    const Icon = ICON[s.aktuell];
    return (
      <Shell>
        <div data-rueckmeldung-danke>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Danke, gespeichert.</h1>
          <div className="mt-4 rounded-xl border border-[color:var(--border)] bg-[color:var(--background)] p-4">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Icon className="h-4 w-4 text-[color:var(--muted)]" />
              {name}: {RUECKMELDUNG_LABEL[s.aktuell]}
            </div>
            {s.wiedervorlageAt ? (
              <div className="mt-1.5 flex items-center gap-2 text-sm text-[color:var(--muted)]" data-rueckmeldung-wiedervorlage>
                <Clock className="h-4 w-4" />
                Wiedervorlage {wiedervorlageText(s.wiedervorlageAt)}
              </div>
            ) : null}
          </div>
          <Link href={`/rueckmeldung/${token}`} className={buttonClass("secondary", "md", "mt-4 h-12 w-full text-base")}>
            Ändern
          </Link>
          <Link href="/buyer" className="mt-2 block py-2.5 text-center text-sm text-[color:var(--muted)] underline">
            Alle Leads im Kundenbereich
          </Link>
        </div>
      </Shell>
    );
  }

  // ── Auswahl ───────────────────────────────────────────────────────────
  const vorauswahl: RueckmeldungArt | null = istRueckmeldungArt(sp.a) ? sp.a : s.aktuell;
  const fehler =
    sp.fehler === "limit"
      ? "Zu viele Versuche in kurzer Zeit. Bitte warten Sie einen Moment."
      : sp.fehler === "wahl"
        ? "Bitte wählen Sie eine Antwort."
        : sp.fehler === "speichern"
          ? "Das hat nicht geklappt. Bitte versuchen Sie es erneut oder tragen Sie es im Kundenbereich ein."
          : null;
  return (
    <Shell>
      {kopf}
      {fehler ? <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-red-200">{fehler}</div> : null}
      <form action={rueckmeldungAction.bind(null, token)} className="mt-5 space-y-5" data-rueckmeldung>
        <fieldset>
          <legend className="text-base font-semibold">Wie lief Ihr Anruf?</legend>
          <div className="mt-3 space-y-2">
            {RUECKMELDUNG_ARTEN.map((art) => {
              const Icon = ICON[art];
              return (
                <label
                  key={art}
                  data-art={art}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 py-3 transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand-soft)] has-focus-visible:ring-2 has-focus-visible:ring-[color:var(--brand)]/30"
                >
                  <input type="radio" name="art" value={art} defaultChecked={art === vorauswahl} required className="sr-only" />
                  <Icon className="h-5 w-5 shrink-0 text-[color:var(--muted)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">{RUECKMELDUNG_LABEL[art]}</span>
                    {art === "nicht_erreicht" ? (
                      <span className="block text-xs text-[color:var(--muted)]">Wiedervorlage {wiedervorlageText(naechsterWerktag9())}</span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <SubmitButton pendingLabel="Wird gespeichert …" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
          Speichern
        </SubmitButton>
      </form>
      {s.aktuell && s.aktuellAt ? (
        <p className="mt-3 text-center text-xs text-[color:var(--muted)]" data-rueckmeldung-zuletzt>
          Zuletzt gemeldet: {RUECKMELDUNG_LABEL[s.aktuell]} am {datum(s.aktuellAt)}
        </p>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 py-6 sm:justify-center sm:py-10">
      <div className="mb-5 flex items-center gap-2 text-[17px] font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[color:var(--brand)] text-[13px] text-white">↗</span>
        <span>
          performance<span className="text-[color:var(--brand)]">growth</span>
        </span>
      </div>
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
    </main>
  );
}
