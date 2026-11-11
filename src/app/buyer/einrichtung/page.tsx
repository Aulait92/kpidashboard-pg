import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2,
  ChevronDown, ClipboardList, KeyRound, MessageCircle, Percent, Rocket, Smartphone } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { customerSetupProgress, loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { HelpCallPicker, MetaConfirmButton, QuestionnaireForm } from "./forms";
import { helpCallSlots } from "@/lib/help-call";
import { InstallApp } from "@/components/install-app";
import { getAppUrl } from "@/lib/email";
import { loadCustomerProvision } from "@/lib/provision-server";
import { provisionSetupHint } from "@/lib/provision";
import Link from "next/link";
import { selfConnectEnabled } from "@/lib/whatsapp/dialog360-partner";
import { ERROR_HELP, parseConnectPath } from "@/lib/whatsapp/connect-guide";
import { WhatsAppGuide } from "@/components/whatsapp-guide";
import { LeadTimesForm, SourcePicker } from "@/components/calendar-sources";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import {
  connectAllianzAction,
  disconnectAllianzAction,
  disconnectNativeCalendarAction,
  removeIcsAction,
  saveIcsAction,
  saveLeadTimesAction,
} from "@/app/buyer/kalender/source-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einrichtung | performancegrowth" };

const dateFmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(d);

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ gcal?: string; wa?: string; schritt?: string; weg?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const ob = await loadOnboarding({ customerId: ctx.customerId });
  if (!ob) redirect("/buyer");
  const { gcal, wa, schritt, weg } = await searchParams;
  const offer = ob.offerId
    ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true } })
    : null;
  const items = onboardingChecklist(ob, offer);
  const done = (k: string) => items.find((i) => i.key === k)?.done ?? false;
  const software = ob.package !== "service";
  // Fortschritt nur aus den Schritten, die der Kunde selbst erledigt (nicht Zahlung, Login, unsere Arbeit).
  const progress = customerSetupProgress(items);
  const businessId = process.env.PG_META_BUSINESS_ID?.trim() || "3089330734489612";
  const readOnly = ctx.preview;
  const provision = await loadCustomerProvision(ctx.customerId);
  // WhatsApp selbst verbinden (360dialog), nur mit Software und wenn der Partner-Zugang eingerichtet ist.
  const waEnabled = software && selfConnectEnabled();
  const waAccount = waEnabled
    ? await prisma.whatsAppAccount.findUnique({ where: { customerId: ctx.customerId }, select: { status: true, phoneNumber: true, dialog360ChannelId: true } })
    : null;
  const order = ["questionnaire", "metaAccess", ...(software ? ["calendar"] : []), ...(waEnabled ? ["whatsapp"] : [])];
  let stepNo = software ? 3 : 2;
  const nextNo = () => ++stepNo;
  const current = order.find((k) => !done(k)) ?? "start";
  // Direkt-Link von der Startseite (?schritt=calendar) klappt diesen Schritt auf.
  const isOpen = (k: string) => current === k || schritt === k;
  const helpUpcoming = ob.helpCallAt && ob.helpCallAt > new Date();
  const slots = !helpUpcoming && !ob.liveAt ? await helpCallSlots().catch(() => []) : [];
  const calendar = await loadCalendarSetup(ctx.customerId, ctx.customerId);
  const makler = (await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { vermittlerTyp: true } }))?.vermittlerTyp === "makler";
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
            <span className="font-medium">
              {ob.liveAt
                ? "Alles eingerichtet, Sie sind live."
                : progress.complete
                  ? "Ihr Teil ist erledigt – danke!"
                  : `Ihr Teil: ${progress.done} von ${progress.total} erledigt`}
            </span>
            <span className="text-[color:var(--muted)]">{ob.liveAt ? "100" : progress.percent} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken,#f1f5f9)]">
            <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${ob.liveAt ? 100 : progress.percent}%` }} />
          </div>
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            {progress.complete ? "Den Rest erledigen wir." : "Ca. 5 Minuten für Sie. Den Rest erledigen wir."}
          </p>
          {!ob.liveAt ? <OurPart ours={progress.ours} startDate={ob.startDate} /> : null}
        </div>
      </Card>

      <div className="space-y-5">
        <Step n={1} title="Kurzer Fragebogen" icon={ClipboardList} done={done("questionnaire")} open={isOpen("questionnaire")} id="questionnaire">
          <p className="mb-4 text-sm text-[color:var(--muted)]">Nur noch, wie Sie arbeiten möchten:</p>
          <QuestionnaireForm software={software} initial={(ob.questionnaire ?? {}) as Record<string, never>} readOnly={readOnly} />
        </Step>

        <Step n={2} title="Zugriff auf Ihr Meta-Werbekonto" icon={KeyRound} done={done("metaAccess")} open={isOpen("metaAccess")} id="metaAccess">
          <p className="text-sm text-[color:var(--muted)]">So schalten wir die Anzeigen in Ihrem Werbekonto. Das Budget bleibt bei Ihnen.</p>
          <details className="my-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3 text-[15px]">
            <summary className="cursor-pointer font-medium">Noch kein Business Manager? So legen Sie ihn an</summary>
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
              Ihr <b>Werbekonto</b> (Kampagnen verwalten) und Ihre <b>Facebook-Seite</b> mit <b>„Volle Kontrolle“</b> auswählen (nötig, damit
              Leads direkt bei Ihnen ankommen), ggf. auch Instagram, und speichern.
            </li>
          </ol>
          <MetaConfirmButton done={done("metaAccess")} readOnly={readOnly} />
          <div id="hilfetermin" className="mt-5 scroll-mt-20 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
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
                <p className="mb-3 mt-1 text-sm text-[color:var(--muted)]">15 Minuten per Video, wir machen es gemeinsam.</p>
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
          <Step n={3} title="Kalender und freie Zeiten" icon={CalendarDays} done={done("calendar")} open={isOpen("calendar")} id="calendar">
            <p className="mb-4 text-sm text-[color:var(--muted)]">
              Damit Leads nur Termine bekommen, wenn Sie wirklich Zeit haben.
            </p>
            {gcal === "connected" ? <p className="mb-3 text-sm font-medium text-emerald-700">Kalender verbunden.</p> : null}
            {gcal && gcal !== "connected" ? (
              <p className="mb-3 text-sm font-medium text-rose-700">
                {gcal === "consent"
                  ? makler
                    ? "Ihr Unternehmen muss die Verbindung erst freigeben. Kein Problem: Wählen Sie unten den Kalender-Link, oder rufen Sie kurz an."
                    : "Ihr Unternehmen muss die Verbindung erst freigeben. Kein Problem: Wählen Sie unten den Kalender-Link oder den Allianz-Online-Kalender, oder rufen Sie kurz an."
                  : "Das hat nicht geklappt. Bitte noch einmal versuchen oder kurz anrufen, dann erledigen wir es gemeinsam."}
              </p>
            ) : null}
            <SourcePicker
              status={calendar.status}
              readOnly={readOnly}
              connectLinks={{ google: "/api/google/connect", microsoft: "/api/microsoft/connect" }}
              icsAction={saveIcsAction}
              removeIcsAction={removeIcsAction}
              allianzAction={connectAllianzAction}
              disconnectAllianzAction={disconnectAllianzAction}
              disconnectNativeAction={disconnectNativeCalendarAction}
              allianzOption={!makler}
            />
            <div className="mt-6 border-t border-[color:var(--border)] pt-5">
              <p className="text-[15px] font-medium">Wann dürfen Leads Termine buchen?</p>
              <p className="mb-3 mt-1 text-sm text-[color:var(--muted)]">
                Unser Assistent schlägt nur diese Zeiten vor, und nur wenn Sie dann frei sind. Einzelne Zeiten sperren Sie unter{" "}
                <Link href="/buyer/kalender" className="font-medium text-[color:var(--brand)] underline">
                  Mein Kalender
                </Link>
                .
              </p>
              <LeadTimesForm initial={calendar.leadTimes} action={saveLeadTimesAction} readOnly={readOnly} source={calendar.source} />
            </div>
          </Step>
        ) : null}

        {waEnabled ? (
          <Step n={nextNo()} title="WhatsApp verbinden" icon={MessageCircle} done={done("whatsapp")} open={isOpen("whatsapp") || !!wa || !!weg} id="whatsapp">
            <WhatsAppStep wa={wa} weg={weg} account={waAccount} done={done("whatsapp")} readOnly={readOnly} />
          </Step>
        ) : null}

        <Step n={nextNo()} title="App aufs Handy" icon={Smartphone} done={false} open={current === "start" && !ob.liveAt}>
          <InstallApp appUrl={appHost()} />
        </Step>

        <Step n={nextNo()} title="Provisionen prüfen (1 Minute, optional)" icon={Percent} done={provision.hasCustom} open={false}>
          {/* Typ aus dem angenommenen Angebot bekannt → nicht mehr danach fragen. */}
          <p className="text-sm text-[color:var(--muted)]">{provisionSetupHint(provision.typ, !!ob.offerId)}</p>
          <Link href="/buyer/provisionen" className={buttonClass("secondary", "md", "mt-4")}>
            Provisionen prüfen
          </Link>
        </Step>

        <Step n={nextNo()} title="Start" icon={Rocket} done={!!ob.liveAt} open={current === "start" && !!ob.liveAt}>
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

/** Unser Teil der Einrichtung – nur zur Info, zählt nicht in den Fortschritt des Kunden. */
function OurPart({ ours, startDate }: { ours: { key: string; done: boolean }[]; startDate: Date | null }) {
  const short = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" });
  const label = (k: string) =>
    k === "campaign" ? "Kampagne & Leadformular" : k === "testLead" ? "Testlead" : startDate ? `Go-live am ${short.format(startDate)}` : "Go-live";
  return (
    <div className="mt-4 border-t border-[color:var(--border)] pt-3 text-sm">
      <span className="font-medium">Unser Teil: </span>
      <span className="text-[color:var(--muted)]">
        {ours.map((o, i) => (
          <span key={o.key}>
            {i > 0 ? " · " : ""}
            {label(o.key)}
            {o.done ? " ✓" : ""}
          </span>
        ))}
      </span>
    </div>
  );
}

/** Adresse der App ohne https:// (für die Handy-Anleitung). */
function appHost(): string {
  try {
    return getAppUrl().replace(/^https?:\/\//, "");
  } catch {
    return "app.performancegrowth.de";
  }
}

function Step({
  n,
  title,
  icon: Icon,
  done,
  open,
  id,
  children,
}: {
  id?: string;
  n: number;
  title: string;
  icon: typeof Rocket;
  done: boolean;
  /** Nur der nächste offene Schritt ist aufgeklappt. */
  open: boolean;
  children: React.ReactNode;
}) {
  // Erledigte Schritte sind zugeklappt (antippen zum Ansehen), offene aufgeklappt.
  return (
    <details id={id} open={open} className="group overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-3.5 group-open:border-b group-open:border-[color:var(--border)]">
        {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Icon className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />}
        <span className={`flex-1 text-[15px] font-semibold tracking-tight ${done ? "text-[color:var(--muted)]" : ""}`}>
          {n}. {title}
        </span>
        {done ? <span className="text-xs font-semibold text-emerald-700">erledigt</span> : null}
        <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="p-5">{children}</div>
    </details>
  );
}

const WA_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: { ok: true, text: "WhatsApp ist verbunden. Wir prüfen noch die Nachrichtenvorlagen und schalten den Assistenten dann ein." },
  pending: { ok: true, text: "Fast geschafft: Ihre Nummer wird bei WhatsApp noch eingerichtet. Das dauert meist nur wenige Minuten, Sie müssen nichts weiter tun." },
  error: { ok: false, text: "Das hat nicht geklappt. Kein Problem: Wir haben eine Nachricht bekommen und melden uns bei Ihnen. Sie können es auch gleich noch einmal versuchen." },
  state: { ok: false, text: "Der Link war abgelaufen. Bitte noch einmal auf „WhatsApp verbinden“ tippen." },
  forbidden: { ok: false, text: "Das kann nur der Inhaber des Kontos." },
  off: { ok: false, text: "Das Verbinden ist gerade nicht verfügbar. Wir richten WhatsApp gemeinsam mit Ihnen ein." },
};

/** Schritt „WhatsApp verbinden“: Erklärung, Knopf zum 360dialog-Onboarding, Status. */
function WhatsAppStep({
  wa,
  weg,
  account,
  done,
  readOnly,
}: {
  wa?: string;
  weg?: string;
  account: { status: string; phoneNumber: string | null; dialog360ChannelId: string | null } | null;
  done: boolean;
  readOnly: boolean;
}) {
  const msg = wa ? WA_MESSAGES[wa] : undefined;
  const pending = !done && account?.status === "pending" && !!account.dialog360ChannelId;
  return (
    <>
      {msg ? <p className={`mb-3 text-sm font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p> : null}
      {wa === "error" ? (
        <div className="mb-4 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-medium">Häufige Ursachen:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {ERROR_HELP.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {done ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Verbunden{account?.phoneNumber ? `: +${account.phoneNumber.replace(/^\+/, "")}` : ""}
          </p>
          <p className="text-sm text-[color:var(--muted)]">
            Ihr Assistent schreibt neue Leads ab dem Start über diese Nummer an. Alle Gespräche finden Sie unter „Chats“.
          </p>
        </div>
      ) : msg?.ok ? null : pending ? (
        <p className="text-sm font-medium text-amber-700">
          Ihre Nummer wird gerade eingerichtet. Das dauert meist nur wenige Minuten. Sie müssen nichts weiter tun, wir melden uns, falls etwas fehlt.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-[color:var(--muted)]">
            Über diese Nummer schreibt Ihr Assistent neuen Leads in Ihrem Namen. Das Verbinden machen Sie einmal, es dauert etwa 10 Minuten.
          </p>
          <WhatsAppGuide initialPath={parseConnectPath(weg)} readOnly={readOnly} helpHref="/buyer/einrichtung?schritt=metaAccess#hilfetermin" />
        </>
      )}
    </>
  );
}
