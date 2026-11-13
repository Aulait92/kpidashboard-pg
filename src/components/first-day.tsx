// Startseite für Kunden, die noch keinen einzigen Lead haben.
// Vor dem Go-live: Einrichtung prominent und positiv („Ihr Start am …“, eigener Fortschritt,
// nächste Schritte direkt anklickbar). Nach dem Go-live: wie ein Lead ankommt.

import Link from "next/link";
import { ArrowRight, BellRing, CalendarDays, CheckCircle2, Circle, ClipboardList, KeyRound, LifeBuoy, MessageCircle, Phone, Rocket, Smartphone } from "lucide-react";
import { buttonClass, Card } from "@/components/ui";
import { customerSetupProgress, loadOnboarding, onboardingChecklist, type ChecklistItem } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";

const dateFmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" }).format(d);

export async function FirstDay({
  customerId,
  owner,
  whatsapp,
}: {
  customerId: string;
  /** Inhaber sieht Einrichtung und Kalender, Berater nur den Ablauf. */
  owner: boolean;
  whatsapp: boolean;
}) {
  const [ob, calendar] = await Promise.all([
    loadOnboarding({ customerId }),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } }).catch(() => null),
  ]);
  const offer = ob?.offerId
    ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true } })
    : null;
  const progress = ob ? customerSetupProgress(onboardingChecklist(ob, offer)) : null;
  const live = !ob || !!ob.liveAt;
  const calendarOk = calendar?.status === "connected";

  if (ob && !live && progress) {
    return <BeforeStart owner={owner} whatsapp={whatsapp} startDate={ob.startDate} progress={progress} />;
  }

  const status = live
    ? "Ihre Anzeigen laufen. Der erste Lead kommt meist innerhalb von 48 Stunden – Sie bekommen sofort Bescheid."
    : ob?.startDate
      ? `Start am ${dateFmt(ob.startDate)}. Bis dahin richten wir alles gemeinsam ein.`
      : "Wir richten gerade alles für Sie ein. Sobald die Anzeigen laufen, kommen hier Ihre Leads an.";

  const steps = [
    { icon: BellRing, title: "Ein Lead füllt das Formular aus", text: "Sie bekommen sofort eine Benachrichtigung aufs Handy." },
    whatsapp
      ? { icon: MessageCircle, title: "Der Assistent meldet sich per WhatsApp", text: "Innerhalb weniger Minuten, stellt die wichtigsten Fragen und bucht einen Termin in Ihren Kalender." }
      : { icon: MessageCircle, title: "Der Lead kommt per E-Mail und hier in die App", text: "Mit allen Angaben aus dem Formular." },
    { icon: Phone, title: "Hier auf „Heute“ steht, was zu tun ist", text: "Anrufen, antworten, eintragen wie es lief – die App plant den nächsten Schritt." },
  ];

  const todo = [
    ...(owner && ob && !ob.liveAt
      ? [{ done: false, icon: Rocket, text: `Einrichtung abschließen${progress ? ` (${progress.done} von ${progress.total})` : ""}`, href: "/buyer/einrichtung" }]
      : []),
    { done: false, icon: Smartphone, text: "App aufs Handy legen und Benachrichtigungen einschalten", href: owner && ob ? "/buyer/einrichtung" : undefined },
    ...(owner && whatsapp ? [{ done: calendarOk, icon: CalendarDays, text: calendarOk ? "Kalender verbunden" : "Kalender verbinden, damit Termine nur in freie Zeiten fallen", href: calendarOk ? undefined : ob ? "/buyer/einrichtung" : "/buyer/kalender" }] : []),
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
              <Rocket className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Noch keine Leads – so geht es los</h2>
              <p className="mt-1 text-sm text-[color:var(--muted)]">{status}</p>
            </div>
          </div>
          <ol className="mt-5 space-y-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-xs font-bold text-[color:var(--muted)]">{i + 1}</span>
                <div className="text-sm">
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-[color:var(--muted)]">{s.text}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Card>

      <Card>
        <div className="p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold">Damit Sie nichts verpassen</h3>
          <ul className="mt-3 divide-y divide-[color:var(--border)]">
            {todo.map((t) => {
              const row = (
                <span className="flex items-center gap-3 py-3 text-sm">
                  {t.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-[color:var(--border-strong)]" />}
                  <span className={t.done ? "text-[color:var(--muted)]" : "font-medium"}>{t.text}</span>
                </span>
              );
              return <li key={t.text}>{t.href ? <Link href={t.href} className="block hover:text-[color:var(--brand)]">{row}</Link> : row}</li>;
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            {owner && ob && !ob.liveAt ? (
              <Link href="/buyer/einrichtung" className={buttonClass("primary", "md")}>
                Einrichtung öffnen
              </Link>
            ) : null}
            {owner && ob && !ob.liveAt ? (
              <Link href="/buyer/einrichtung" className={buttonClass("secondary", "md", "gap-1.5")}>
                <LifeBuoy className="h-4 w-4" /> 15-Minuten-Hilfetermin
              </Link>
            ) : (
              <a href="tel:+4915152418846" className={buttonClass("secondary", "md", "gap-1.5")}>
                <LifeBuoy className="h-4 w-4" /> Fragen? +49 151 52418846
              </a>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Vor dem Go-live ────────────────────────────────────────────────────

const STEP_TEXT: Record<string, { label: string; icon: typeof Rocket }> = {
  questionnaire: { label: "Kurzen Fragebogen ausfüllen", icon: ClipboardList },
  metaAccess: { label: "Meta-Werbekonto freigeben", icon: KeyRound },
  calendar: { label: "Kalender verbinden", icon: CalendarDays },
  whatsapp: { label: "WhatsApp verbinden", icon: MessageCircle },
};

/** Ganze Tage bis zum Start (Berliner Kalendertage), nie negativ. */
export function daysUntil(start: Date, now = new Date()): number {
  const day = (d: Date) => {
    const [y, m, dd] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(d)
      .split("-")
      .map(Number);
    return Date.UTC(y, m - 1, dd);
  };
  return Math.max(0, Math.round((day(start) - day(now)) / 86_400_000));
}

/** Überschrift und Unterzeile der Start-Karte (auch für Tests). */
export function startHeadline(startDate: Date | null, now = new Date()): { title: string; sub: string } {
  if (!startDate) return { title: "Ihr Start ist in Vorbereitung", sub: "Wir richten gerade alles für Sie ein." };
  const n = daysUntil(startDate, now);
  return {
    title: `Ihr Start am ${dateFmt(startDate)}`,
    sub: n === 0 ? "Heute geht es los." : n === 1 ? "Morgen geht es los." : `In ${n} Tagen geht es los.`,
  };
}

function BeforeStart({
  owner,
  whatsapp,
  startDate,
  progress,
}: {
  owner: boolean;
  whatsapp: boolean;
  startDate: Date | null;
  progress: ReturnType<typeof customerSetupProgress>;
}) {
  const head = startHeadline(startDate);
  const next = progress.open.slice(0, 4);
  const short = startDate ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" }).format(startDate) : null;
  const ourLabel = (i: ChecklistItem) =>
    i.key === "whatsapp" ? "WhatsApp verbinden" : i.key === "campaign" ? "Kampagne & Leadformular" : i.key === "testLead" ? "Testlead" : short ? `Go-live am ${short}` : "Go-live";

  return (
    <div className="space-y-5">
      <Card className="ring-1 ring-[color:var(--brand)]/25">
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand)] text-white">
              <Rocket className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{head.title}</h2>
              <p className="mt-0.5 text-sm text-[color:var(--muted)]">{head.sub}</p>
            </div>
          </div>

          {owner ? (
            progress.complete ? (
              <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <b>Alles eingerichtet</b> – wir bereiten Ihre Kampagne vor{short ? `, Start am ${short}` : ""}.
                </span>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      Einrichtung: {progress.done} von {progress.total} erledigt
                    </span>
                    <span className="text-[color:var(--muted)]">noch ca. 5 Minuten</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken,#f1f5f9)]">
                    <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${Math.max(progress.percent, 4)}%` }} />
                  </div>
                </div>
                <ul className="mt-4 divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
                  {next.map((s) => {
                    const t = STEP_TEXT[s.key] ?? { label: s.label, icon: Circle };
                    const Icon = t.icon;
                    return (
                      <li key={s.key}>
                        <Link
                          href={`/buyer/einrichtung?schritt=${s.key}#${s.key}`}
                          className="flex items-center gap-3 px-4 py-3 text-sm font-medium hover:bg-[color:var(--surface-sunken,#f8fafc)] hover:text-[color:var(--brand)]"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
                          <span className="flex-1">{t.label}</span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </>
            )
          ) : (
            <p className="mt-4 text-sm text-[color:var(--muted)]">Ihr Team richtet gerade alles ein. Sobald die Anzeigen laufen, kommen hier Ihre Leads an.</p>
          )}

          {owner ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {!progress.complete ? (
                <Link href="/buyer/einrichtung" className={buttonClass("primary", "md", "h-11 px-5")}>
                  Einrichtung fortsetzen
                </Link>
              ) : null}
              <Link href="/buyer/einrichtung?schritt=metaAccess#metaAccess" className={buttonClass("secondary", "md", "h-11 gap-1.5 px-5")}>
                <LifeBuoy className="h-4 w-4" /> 15-Minuten-Hilfetermin
              </Link>
            </div>
          ) : null}

          <div className="mt-5 space-y-2 border-t border-[color:var(--border)] pt-4 text-sm">
            {owner ? (
              <Link href="/buyer/einrichtung" className="flex items-center gap-2.5 hover:text-[color:var(--brand)]">
                <Smartphone className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                <span>App aufs Handy legen und Benachrichtigungen einschalten</span>
              </Link>
            ) : null}
            <p className="text-[color:var(--muted)]">
              <span className="font-medium text-[color:var(--foreground)]">Unser Teil: </span>
              {progress.ours.map((o, i) => (
                <span key={o.key}>
                  {i > 0 ? " · " : ""}
                  {ourLabel(o)}
                  {o.done ? " ✓" : ""}
                </span>
              ))}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-5 sm:p-6">
          <h3 className="text-[15px] font-semibold">So läuft es ab, sobald Ihre Kampagne live ist</h3>
          <ol className="mt-4 space-y-3">
            {[
              { title: "Ein Lead füllt das Formular aus", text: "Sie bekommen sofort eine Benachrichtigung aufs Handy." },
              whatsapp
                ? { title: "Der Assistent meldet sich per WhatsApp", text: "In wenigen Minuten, stellt die wichtigsten Fragen und bucht einen Termin in Ihren Kalender." }
                : { title: "Der Lead kommt per E-Mail und hier in die App", text: "Mit allen Angaben aus dem Formular." },
              { title: "Auf „Heute“ steht, was zu tun ist", text: "Anrufen, antworten, eintragen wie es lief – die App plant den nächsten Schritt." },
            ].map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-xs font-bold text-[color:var(--muted)]">{i + 1}</span>
                <div className="text-sm">
                  <span className="font-semibold">{s.title}</span> <span className="text-[color:var(--muted)]">– {s.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}
