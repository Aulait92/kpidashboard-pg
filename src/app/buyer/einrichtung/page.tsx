import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, KeyRound, Rocket } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { checklistProgress, loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { HelpCallPicker, MetaConfirmButton, QuestionnaireForm } from "./forms";
import { helpCallSlots } from "@/lib/help-call";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einrichtung | performancegrowth" };

const dateFmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(d);

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const ob = await loadOnboarding({ customerId: ctx.customerId });
  if (!ob) redirect("/buyer");
  const { gcal } = await searchParams;
  const offer = ob.offerId
    ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true } })
    : null;
  const items = onboardingChecklist(ob, offer);
  const done = (k: string) => items.find((i) => i.key === k)?.done ?? false;
  const software = ob.package !== "service";
  const progress = checklistProgress(items);
  const businessId = process.env.PG_META_BUSINESS_ID?.trim() || "3089330734489612";
  const readOnly = ctx.preview;
  const helpUpcoming = ob.helpCallAt && ob.helpCallAt > new Date();
  const slots = !helpUpcoming && !ob.liveAt ? await helpCallSlots().catch(() => []) : [];
  const timeFmt = (d: Date) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Einrichtung"
        subtitle={
          ob.liveAt
            ? `Live seit ${dateFmt(ob.liveAt)}.`
            : ob.startDate
              ? `Start am ${dateFmt(ob.startDate)}. Bis dahin richten wir alles gemeinsam ein.`
              : "Wir richten alles gemeinsam ein."
        }
      />

      <Card className="mb-5">
        <div className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{ob.liveAt ? "Alles eingerichtet, Sie sind live." : `${progress.done} von ${progress.total} Schritten erledigt`}</span>
            <span className="text-[color:var(--muted)]">{ob.liveAt ? "100" : progress.percent} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken,#f1f5f9)]">
            <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${ob.liveAt ? 100 : progress.percent}%` }} />
          </div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Ihre Aufgaben dauern zusammen etwa 5 Minuten. Alles andere erledigen wir: Kampagne, Werbemittel, Leadformular
            {software ? ", WhatsApp-Assistent" : ""}.
          </p>
        </div>
      </Card>

      <div className="space-y-5">
        <Step n={1} title="Kurzer Fragebogen" icon={ClipboardList} done={done("questionnaire")}>
          <p className="mb-4 text-sm text-[color:var(--muted)]">
            Gebiet und Produkte kennen wir schon aus dem Gespräch. Hier nur noch, wie Sie arbeiten möchten:
          </p>
          <QuestionnaireForm software={software} initial={(ob.questionnaire ?? {}) as Record<string, never>} readOnly={readOnly} />
        </Step>

        <Step n={2} title="Zugriff auf Ihr Meta-Werbekonto" icon={KeyRound} done={done("metaAccess")}>
          <p className="text-sm text-[color:var(--muted)]">
            Damit wir die Anzeigen in Ihrem Werbekonto schalten können, geben Sie uns als Partner Zugriff. Ihr Werbebudget
            bleibt dabei vollständig in Ihrer Hand.
          </p>
          <details className="my-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3 text-[15px]">
            <summary className="cursor-pointer font-medium">Sie haben noch keinen Business Manager (Business-Portfolio)? So legen Sie ihn an</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>
                <a href="https://business.facebook.com/overview" target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                  business.facebook.com
                </a>{" "}
                öffnen und mit Ihrem privaten Facebook-Profil anmelden (es bleibt unsichtbar für Kunden).
              </li>
              <li>
                <b>Business-Portfolio erstellen</b>: Name Ihrer Agentur, Ihr Name und Ihre geschäftliche E-Mail, dann die
                E-Mail bestätigen.
              </li>
              <li>
                Unter <b>Einstellungen → Konten → Seiten</b> Ihre Facebook-Seite hinzufügen (gibt es noch keine Seite, dort
                direkt eine neue anlegen).
              </li>
              <li>
                Unter <b>Einstellungen → Konten → Werbekonten</b> ein Werbekonto hinzufügen oder neu erstellen (Währung EUR,
                Zeitzone Berlin).
              </li>
              <li>
                Im Werbekonto unter <b>Abrechnung</b> eine Zahlungsmethode (z. B. Kreditkarte) hinterlegen. Darüber zahlen
                Sie das Werbebudget direkt an Meta.
              </li>
              <li>Danach weiter mit den Schritten unten.</li>
            </ol>
          </details>
          <ol className="my-4 list-decimal space-y-1.5 pl-5 text-[15px]">
            <li>
              <a href="https://business.facebook.com/settings/partners" target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                Meta Business-Einstellungen → Partner
              </a>{" "}
              öffnen.
            </li>
            <li>
              <b>Hinzufügen</b> → „Einem Partner Zugriff auf deine Assets gewähren“.
            </li>
            <li>
              Unsere Business-ID eingeben: <b className="select-all">{businessId}</b>
            </li>
            <li>
              Ihr <b>Werbekonto</b> (Kampagnen verwalten) und Ihre <b>Facebook-Seite</b> auswählen, ggf. auch Instagram, und speichern.
            </li>
          </ol>
          <MetaConfirmButton done={done("metaAccess")} readOnly={readOnly} />
          <div className="mt-5 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
            <p className="text-[15px] font-medium">Klappt etwas nicht? Wir machen es gemeinsam.</p>
            {helpUpcoming ? (
              <p className="mt-2 text-[15px]">
                Ihr Hilfetermin: <b>{timeFmt(ob.helpCallAt!)} Uhr</b> (15 Minuten, Video).
                {ob.helpCallUrl ? (
                  <>
                    {" "}
                    <a href={ob.helpCallUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                      Zum Video-Call
                    </a>
                  </>
                ) : null}
              </p>
            ) : slots.length ? (
              <>
                <p className="mb-3 mt-1 text-sm text-[color:var(--muted)]">
                  Buchen Sie einen 15-Minuten-Termin per Video. Wir richten es per Bildschirmfreigabe gemeinsam ein.
                </p>
                <HelpCallPicker slots={slots} readOnly={readOnly} />
              </>
            ) : null}
            <p className="mt-3 text-sm text-[color:var(--muted)]">
              Oder rufen Sie an:{" "}
              <a href="tel:+4915152418846" className="font-medium text-[color:var(--brand)]">+49 151 52418846</a>
            </p>
          </div>
        </Step>

        {software ? (
          <Step n={3} title="Kalender verbinden" icon={CalendarDays} done={done("calendar")}>
            <p className="text-sm text-[color:var(--muted)]">
              Der digitale Assistent bucht Termine nur in freie Zeiten und trägt sie direkt in Ihren Kalender ein.
            </p>
            {gcal === "connected" ? <p className="mt-3 text-sm font-medium text-emerald-700">Kalender verbunden.</p> : null}
            {gcal && gcal !== "connected" ? (
              <p className="mt-3 text-sm font-medium text-rose-700">
                {gcal === "consent"
                  ? "Ihr Unternehmen muss die Verbindung erst freigeben. Kein Problem: Rufen Sie kurz an, dann richten wir es gemeinsam ein."
                  : "Das hat nicht geklappt. Bitte noch einmal versuchen oder kurz anrufen, dann erledigen wir es gemeinsam."}
              </p>
            ) : null}
            {done("calendar") ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Verbunden
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="/api/google/connect" className={buttonClass("secondary", "md", readOnly ? "pointer-events-none opacity-60" : "")}>
                  Google-Kalender verbinden
                </a>
                <a href="/api/microsoft/connect" className={buttonClass("secondary", "md", readOnly ? "pointer-events-none opacity-60" : "")}>
                  Outlook / Microsoft 365 verbinden
                </a>
              </div>
            )}
          </Step>
        ) : null}

        <Step n={software ? 4 : 3} title="Start" icon={Rocket} done={!!ob.liveAt}>
          <p className="text-sm text-[color:var(--muted)]">
            {ob.startDate ? `Am ${dateFmt(ob.startDate)} ` : "Zum Start "}
            gehen die Anzeigen live.{" "}
            {software
              ? "Neue Leads bekommen innerhalb weniger Minuten eine WhatsApp-Nachricht und können direkt einen Termin buchen."
              : "Jeder neue Lead kommt sofort per E-Mail und steht hier im Kundenbereich unter „Leads“."}
          </p>
        </Step>
      </div>
    </main>
  );
}

function Step({
  n,
  title,
  icon: Icon,
  done,
  children,
}: {
  n: number;
  title: string;
  icon: typeof Rocket;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={`${n}. ${title}`}
        icon={Icon}
        actions={
          done ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> erledigt
            </span>
          ) : null
        }
      />
      <div className="p-5">{children}</div>
    </Card>
  );
}
