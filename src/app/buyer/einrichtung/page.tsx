import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, KeyRound, Rocket, Video } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { checklistProgress, loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { MetaConfirmButton, QuestionnaireForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einrichtung | performancegrowth" };

const dateFmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(d);

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ gcal?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
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
  const businessId = process.env.PG_META_BUSINESS_ID?.trim() || null;
  const readOnly = ctx.preview;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Einrichtung"
        subtitle={ob.startDate ? `Start am ${dateFmt(ob.startDate)} – bis dahin richten wir alles gemeinsam ein.` : "Wir richten alles gemeinsam ein."}
      />

      <Card className="mb-5">
        <div className="p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{ob.liveAt ? "Alles eingerichtet – Sie sind live." : `${progress.done} von ${progress.total} Schritten erledigt`}</span>
            <span className="text-[color:var(--muted)]">{progress.percent} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken,#f1f5f9)]">
            <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            Ihre Aufgaben dauern zusammen etwa 5 Minuten. Alles andere erledigen wir – Kampagne, Werbemittel, Leadformular
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
              Unsere Business-ID eingeben: <b>{businessId ?? "teilen wir Ihnen im Kickoff mit"}</b>
            </li>
            <li>
              Ihr <b>Werbekonto</b> (Kampagnen verwalten) und Ihre <b>Facebook-Seite</b> auswählen, ggf. auch Instagram – speichern.
            </li>
          </ol>
          <MetaConfirmButton done={done("metaAccess")} readOnly={readOnly} />
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
                  ? "Ihr Unternehmen muss die Verbindung erst freigeben. Kein Problem – wir richten das im Kickoff gemeinsam ein."
                  : "Das hat nicht geklappt. Bitte noch einmal versuchen oder im Kickoff gemeinsam erledigen."}
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

        <Step n={software ? 4 : 3} title="Kickoff-Termin" icon={Video} done={done("kickoff")}>
          {ob.kickoffAt ? (
            <p className="text-[15px]">Ihr Kickoff ist am <b>{dateFmt(ob.kickoffAt)}</b>. Wir freuen uns!</p>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">
              Im Kickoff (ca. 45 Minuten, Video) besprechen wir Zielgruppe, Anzeigen und Ablauf. Wir melden uns in Kürze mit
              Terminvorschlägen.
            </p>
          )}
        </Step>

        <Step n={software ? 5 : 4} title="Start" icon={Rocket} done={!!ob.liveAt}>
          <p className="text-sm text-[color:var(--muted)]">
            {ob.startDate ? `Am ${dateFmt(ob.startDate)} ` : "Zum Start "}
            gehen die Anzeigen live.{" "}
            {software
              ? "Neue Leads bekommen innerhalb weniger Minuten eine WhatsApp-Nachricht und können direkt einen Termin buchen."
              : "Jeder neue Lead kommt sofort per E-Mail und steht hier im Kundenbereich unter „Leads“."}
          </p>
        </Step>
      </div>
    </div>
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
