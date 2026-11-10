// Startseite für Kunden, die noch keinen einzigen Lead haben: statt „Alles erledigt“
// erklärt sie, wann es losgeht, wie ein Lead ankommt und was jetzt noch sinnvoll ist.

import Link from "next/link";
import { BellRing, CalendarDays, CheckCircle2, Circle, LifeBuoy, MessageCircle, Phone, Rocket, Smartphone } from "lucide-react";
import { buttonClass, Card } from "@/components/ui";
import { checklistProgress, loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
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
  const progress = ob ? checklistProgress(onboardingChecklist(ob, offer)) : null;
  const live = !ob || !!ob.liveAt;
  const calendarOk = calendar?.status === "connected";

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
