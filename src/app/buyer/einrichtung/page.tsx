import { redirect } from "next/navigation";
import { isNewUi } from "@/lib/new-ui";
import { HilfeChatButton } from "@/components/hilfe-chat";
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, ClipboardList, FileSignature, FileText, KeyRound, Mail, MessageCircle, Percent, PlayCircle, Rocket, Route, Smartphone, Star, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { MicrosoftAdminConsent } from "@/components/microsoft-admin-consent";
import { microsoftAdminConsentUrl } from "@/lib/microsoft-admin-consent";
import { buttonClass, Card } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { customerSetupProgress, loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { prisma } from "@/lib/prisma";
import { HelpCallPicker, ImpressumUrlForm, MetaAccessForm, QuestionnaireForm, SkipButton, StepExits, WeiterButton } from "./forms";
import { SoArbeitet } from "@/components/so-arbeitet";
import { ladeSoArbeitet } from "@/lib/so-arbeitet-server";
import { ServiceMails } from "@/app/buyer/einstellungen/assistent/service-mails";
import { BeratungsdokuSchalter } from "@/components/beratungsdoku-schalter";
import { VollmachtVersandWahl } from "@/components/vollmacht-versand-wahl";
import { asVollmachtVersand, VERSAND_FRAGE } from "@/lib/maklervollmacht/regeln";
import { BeratungsdokuEinrichtungFrage } from "@/components/beratungsdoku-frage";
import { BD_FRAGE_TEXT, BD_FRAGE_TITEL } from "@/lib/beratungsdoku";
import { serviceMailsDaten } from "@/lib/mail/service-mails-daten";
import { impressumUrlAus } from "@/lib/impressum-fehlt";
import { ErstinfoForm } from "./erstinfo-form";
import { loadErstinfo } from "@/lib/erstinformation";
import { vermittlerStatusLabel } from "@/lib/erstinformation-shared";
import { SmtpForm } from "@/app/buyer/postfach/forms";
import { googleMailAvailable, microsoftMailAvailable } from "@/lib/mail/postfach";
import { appInstalled, loadSetupSettings, videoEmbedUrl, type MetaCheck, type SetupStepKey } from "@/lib/selbst-einrichtung";
import { helpCallSlots } from "@/lib/help-call";
import { InstallApp } from "@/components/install-app";
import { getAppUrl } from "@/lib/email";
import { loadCustomerProvision } from "@/lib/provision-server";
import { provisionSetupHint } from "@/lib/provision";
import { META_LERNT } from "@/lib/zahlen-tipps";
import Link from "next/link";
import { selfConnectEnabled } from "@/lib/whatsapp/dialog360-partner";
import { ERROR_HELP, parseConnectPath } from "@/lib/whatsapp/connect-guide";
import { WhatsAppGuide } from "@/components/whatsapp-guide";
import { WaCheckButton, WaPendingRefresh, WaResetButton } from "./wa-check";
import { WaInvited } from "./wa-invited";
import { LeadTimesForm, SourcePicker } from "@/components/calendar-sources";
import { loadTerminFormate } from "@/lib/termin-formate-server";
import { loadCalendarSetup } from "@/lib/calendar/setup-view";
import {
  connectAllianzAction,
  disconnectAllianzAction,
  disconnectNativeCalendarAction,
  removeIcsAction,
  saveIcsAction,
  saveLeadTimesAction,
} from "@/app/buyer/kalender/source-actions";

import { GesellschaftenWahl, LogoZeile, TestleadSelbst } from "./selbst";
import { loadLogoStand } from "@/lib/branding-logo-server";
import { vertriebFuer } from "@/lib/tarifauswahl-server";
import { bekannteGesellschaften, gesellschaftName } from "@/lib/tarifkatalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Einrichtung | performancegrowth" };

const dateFmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(d);

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ gcal?: string; wa?: string; schritt?: string; weg?: string; produkt?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const ob = await loadOnboarding({ customerId: ctx.customerId });
  if (!ob) redirect("/buyer");
  const { gcal, wa, schritt, weg, produkt } = await searchParams;
  const offer = ob.offerId
    ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } })
    : null;
  const items = onboardingChecklist(ob, offer);
  const done = (k: string) => items.find((i) => i.key === k)?.done ?? false;
  const software = ob.package !== "service";
  // Fortschritt nur aus den Schritten, die der Kunde selbst erledigt (nicht Zahlung, Login, unsere Arbeit).
  const settings = await loadSetupSettings();
  const businessId = settings.businessId;
  const video = (k: SetupStepKey) => settings.videos[k] ?? null;
  const readOnly = ctx.preview;
  const newUi = await isNewUi(ctx.customerId);
  const provision = await loadCustomerProvision(ctx.customerId);
  const appDone = await appInstalled(ctx.customerId);
  // Eine Zählung wie auf der Startseite und im Menü: nur Schritte, die der Kunde selbst erledigt
  const progress = customerSetupProgress(items, { appDone, provisionDone: provision.confirmed });
  const overall = { done: progress.done, total: progress.total, percent: progress.percent, open: progress.open };
  // Live und nichts mehr offen = fertig. Live mit offenen Software-Schritten (z. B. nach Paketwechsel): Fortschritt zeigen.
  const fertig = !!ob.liveAt && overall.open.length === 0;
  // WhatsApp selbst verbinden (360dialog), nur mit Software und wenn der Partner-Zugang eingerichtet ist.
  const waEnabled = software && selfConnectEnabled();
  const waAccount = waEnabled
    ? await prisma.whatsAppAccount.findUnique({ where: { customerId: ctx.customerId }, select: { status: true, phoneNumber: true, dialog360ChannelId: true } })
    : null;
  const has = (k: string) => items.some((i) => i.key === k);
  // Gleiche Reihenfolge wie die Liste oben, die Startseite und die Erinnerungen (SETUP_STEPS)
  const order = [
    "questionnaire",
    "app",
    ...(software ? ["calendar", "mailbox"] : []),
    "provision",
    ...(software ? ["erstinfo", "assistent", "serviceMails"] : []),
    "metaAccess",
    ...(waEnabled ? ["whatsapp"] : []),
    ...["bestandImport", "reviewLink", "team"].filter(has),
  ];
  const isDone = (k: string) => (k === "app" ? appDone : k === "provision" ? provision.confirmed : done(k));
  // „Später“: zum nächsten offenen Schritt nach diesem
  const laterHref = (k: string) => {
    const next = order.slice(order.indexOf(k) + 1).find((x) => !isDone(x));
    return next ? `/buyer/einrichtung?schritt=${next}#${next}` : "/buyer";
  };
  const showGoogleMail = googleMailAvailable() && process.env.GOOGLE_MAIL_VERIFIED === "1";
  let stepNo = 0;
  const nextNo = () => ++stepNo;
  const current = order.find((k) => !isDone(k)) ?? "start";
  // Direkt-Link von der Startseite (?schritt=calendar) klappt diesen Schritt auf.
  const isOpen = (k: string) => current === k || schritt === k;
  const helpUpcoming = ob.helpCallAt && ob.helpCallAt > new Date();
  const slots = !helpUpcoming && !ob.liveAt ? await helpCallSlots().catch(() => []) : [];
  const calendar = await loadCalendarSetup(ctx.customerId, ctx.customerId);
  const kundeBasis = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { vermittlerTyp: true, leadAddress: true, vollmachtVersand: true } });
  const vermittlerTyp = kundeBasis?.vermittlerTyp ?? "vertreter";
  const makler = vermittlerTyp === "makler";
  // Maklervollmacht (Ole, 18.11.2026): Pflichtfrage ohne Vorauswahl, nur Makler; beantwortet eingeklappt und änderbar
  const vvVersand = asVollmachtVersand(kundeBasis?.vollmachtVersand);
  // Erstinformation (§ 15 VersVermV) und Einwilligungstext fürs Leadformular
  const erstinfo = software ? await loadErstinfo(ctx.customerId) : null;
  // Impressum-Adresse: Pflichtangabe auf den Seiten für Endkunden, geprüft, aber nicht blockierend (Rechtsvorprüfung 16.11.2026)
  const impressumFehlt = !impressumUrlAus(ob.websiteInfo);
  // P8 „So arbeitet Ihr Assistent“ und M9 „Service-Mails in Ihrem Namen“ (beide nur mit Software)
  const soArbeitet = software ? await ladeSoArbeitet(ctx.customerId, produkt) : null;
  // Beratungsdokumentation (Paket B): kein Pflichtschritt, zählt nicht in den Fortschritt. Nie beantwortet: sichtbare
  // Ja/Nein-Frage (Ole, 18.11.2026, „Ja“ empfohlen); danach der Schalter eingeklappt.
  const bdKunde = software ? await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { beratungsdokuAn: true, beratungsdokuGefragtAt: true } }) : null;
  const bdAn = software ? (bdKunde?.beratungsdokuAn ?? false) : null;
  const bdFragen = software && !bdKunde?.beratungsdokuAn && !bdKunde?.beratungsdokuGefragtAt;
  const mails = software && !done("serviceMails") ? await serviceMailsDaten(ctx.customerId, ctx.userId, ctx.email) : null;
  // Einrichtung ohne Ole (18.11.2026): Logo, Gesellschaften, Testlead selbst
  const [logo, vertrieb, waVerbunden, eiTel] = software
    ? await Promise.all([
        loadLogoStand(ctx.customerId).catch(() => null),
        vertriebFuer(ctx.customerId).catch(() => null),
        prisma.whatsAppAccount.findUnique({ where: { customerId: ctx.customerId }, select: { status: true } }).then((w) => w?.status === "connected"),
        prisma.erstinformation.findUnique({ where: { customerId: ctx.customerId }, select: { telefon: true } }).then((e) => e?.telefon ?? ""),
      ])
    : [null, null, false, ""];
  const alleGesellschaften = bekannteGesellschaften().map((key) => ({ key, name: gesellschaftName(key) }));
  const metaInit = {
    adAccount: ob.customer.metaAdAccountId ? `act_${ob.customer.metaAdAccountId}` : "",
    page: ob.customer.metaPageId ?? "",
  };
  const timeFmt = (d: Date) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer"
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
          <div className="flex items-center justify-between text-sm" data-setup-progress>
            <span className="font-medium">
              {fertig ? "Alles eingerichtet, Sie sind live." : `Einrichtung: ${overall.done} von ${overall.total} erledigt`}
            </span>
            <span className="text-[color:var(--muted)]">{fertig ? "100" : overall.percent} %</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken,#f1f5f9)]">
            <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${fertig ? 100 : overall.percent}%` }} />
          </div>
          {/* Keine zweite Liste der Schritte mehr (UX-Runde 19.11.2026): Die Schritte darunter zeigen Stand und Inhalt,
              der nächste offene ist aufgeklappt und markiert. Am Handy steht er so auf dem ersten Bildschirm. */}
          <p className="mt-3 text-sm text-[color:var(--muted)]">
            {progress.complete ? "Den Rest erledigen wir." : "Ca. 20 bis 30 Minuten für Sie, jederzeit unterbrechbar. Den Rest erledigen wir."}
          </p>
          {!ob.liveAt ? <OurPart ours={progress.ours} startDate={ob.startDate} /> : null}
        </div>
      </Card>

      <div className="space-y-5">
        <Step n={nextNo()} title="Kurzer Fragebogen" icon={ClipboardList} done={done("questionnaire")} open={isOpen("questionnaire")} id="questionnaire" current={current === "questionnaire"}>
          <p className="mb-4 text-sm text-[color:var(--muted)]">Nur noch, wie Sie arbeiten möchten:</p>
          <QuestionnaireForm
            software={software}
            // Ansprache immer aus der echten Einstellung (Ole, 18.11.2026: Fragebogen zeigte „Sie“, gespeichert war „du“)
            initial={{ ...((ob.questionnaire ?? {}) as Record<string, unknown>), ansprache: kundeBasis?.leadAddress === "du" ? "du" : "sie" } as unknown as Record<string, never>}
            formate={await loadTerminFormate(ctx.customerId)}
            readOnly={readOnly}
          />
        </Step>

        <Step n={nextNo()} title="App aufs Handy und Mitteilungen" icon={Smartphone} done={appDone} open={isOpen("app")} id="app" current={current === "app"}>
          <VideoHint url={video("app")} />
          <InstallApp appUrl={appHost()} />
          {!appDone ? (
            <div className="mt-4">
              <SkipButton kind="app" readOnly={readOnly} label="Ich nutze die App ohne Handy, Schritt überspringen" />
            </div>
          ) : null}
        </Step>

        {software ? (
          <Step n={nextNo()} title="Kalender und freie Zeiten" icon={CalendarDays} done={done("calendar")} open={isOpen("calendar")} id="calendar" current={current === "calendar"}>
            <p className="mb-4 text-sm text-[color:var(--muted)]">
              Damit Leads nur Termine bekommen, wenn Sie wirklich Zeit haben.
            </p>
            <VideoHint url={video("calendar")} />
            {gcal === "connected" ? <p className="mb-3 text-sm font-medium text-emerald-700">Kalender verbunden.</p> : null}
            {gcal && gcal !== "connected" ? (
              <p className="mb-3 text-sm font-medium text-rose-700">
                {gcal === "consent"
                  ? makler
                    ? "Ihr Unternehmen muss die Verbindung erst freigeben. Kein Problem: Öffnen Sie unten „Andere Quelle für freie Zeiten“ und hinterlegen Sie einen Kalender-Link, oder rufen Sie kurz an."
                    : "Ihr Unternehmen muss die Verbindung erst freigeben. Kein Problem: Öffnen Sie unten „Andere Quelle für freie Zeiten“ (Allianz-Online-Kalender oder Kalender-Link), oder rufen Sie kurz an."
                  : "Das hat nicht geklappt. Bitte noch einmal versuchen oder kurz anrufen, dann erledigen wir es gemeinsam."}
              </p>
            ) : null}
            {gcal === "consent" && microsoftAdminConsentUrl() ? <MicrosoftAdminConsent url={microsoftAdminConsentUrl()!} /> : null}
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
            {!done("calendar") ? (
              <StepExits
                laterHref={laterHref("calendar")}
                readOnly={readOnly}
                skips={[{ kind: "skip:calendar:gesellschaft", label: "Mein Versicherer erlaubt das nicht" }]}
              />
            ) : null}
          </Step>
        ) : null}

        {software ? (
          <Step n={nextNo()} title="E-Mail-Postfach verbinden" icon={Mail} done={done("mailbox")} open={isOpen("mailbox")} id="mailbox" current={current === "mailbox"}>
            <p className="mb-3 text-sm text-[color:var(--muted)]">
              Damit schreiben Sie Leads direkt aus der App an, mit Vorlagen und auf Wunsch mit dem Angebot im Anhang. Die E-Mails gehen über Ihr eigenes Postfach,
              Antworten landen dort. Wir senden nur E-Mails, die Sie selbst auslösen, und lesen Ihr Postfach nicht.
            </p>
            <p className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-postfach-gesellschaft>
              Manche Versicherer (z. B. für Ausschließlichkeitsvertreter) erlauben nicht, das dienstliche Postfach mit anderen Programmen zu verbinden. Klären Sie
              das im Zweifel vorher. Sie können den Schritt überspringen.
            </p>
            {ob.customer.mailFeaturesOff ? (
              <p className="text-sm text-[color:var(--muted)]">
                E-Mail-Funktionen sind ausgeschaltet. Wieder einschalten unter{" "}
                <Link href="/buyer/postfach" className="font-medium text-[color:var(--brand)] underline">
                  Einstellungen → E-Mail-Postfach
                </Link>
                .
              </p>
            ) : done("mailbox") ? (
              <p className="text-sm font-medium text-emerald-700">Postfach verbunden.</p>
            ) : (
              <>
                {!readOnly ? (
                  <div className="flex flex-wrap gap-2">
                    {showGoogleMail ? (
                      <a href="/api/mail/connect?anbieter=google" className={buttonClass("secondary", "md")}>
                        Mit Google (Gmail) verbinden
                      </a>
                    ) : null}
                    {microsoftMailAvailable() ? (
                      <a href="/api/mail/connect?anbieter=microsoft" className={buttonClass("secondary", "md")}>
                        Mit Microsoft (Outlook/365) verbinden
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <details className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--border)] px-4 py-3">
                  <summary className="cursor-pointer text-[15px] font-medium">Anderer Anbieter (SMTP, z. B. IONOS, Strato, T-Online, GMX)</summary>
                  <div className="mt-3">
                    <SmtpForm readOnly={readOnly} />
                  </div>
                </details>
                <StepExits laterHref={laterHref("mailbox")} readOnly={readOnly} skips={[{ kind: "mailbox_off", label: "Mein Versicherer erlaubt das nicht" }]} />
              </>
            )}
          </Step>
        ) : null}

        <Step n={nextNo()} title="Provisionen prüfen (1 Minute)" icon={Percent} done={provision.confirmed} open={isOpen("provision")} id="provision" current={current === "provision"}>
          {/* Typ aus dem angenommenen Angebot bekannt → nicht mehr danach fragen. */}
          <p className="text-sm text-[color:var(--muted)]">{provisionSetupHint(provision.typ, !!ob.offerId)}</p>
          {/* Rückmeldung an Meta (lib/capi) */}
          <p className="mt-2 text-sm text-[color:var(--muted)]">{META_LERNT}</p>
          <VideoHint url={video("provision")} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/buyer/provisionen" className={buttonClass("secondary", "md")}>
              Provisionen ansehen
            </Link>
            {!provision.confirmed ? <SkipButton kind="provision" readOnly={readOnly} label="Passt so" primary /> : null}
          </div>
          {software && vertrieb ? <GesellschaftenWahl alle={alleGesellschaften} gewaehlt={vertrieb.vertrieb.gesellschaften} readOnly={readOnly} vermittlerTyp={vermittlerTyp} /> : null}
        </Step>

        {software && erstinfo ? (
          <Step n={nextNo()} title="Erstinformation für Ihre Leads" icon={FileText} done={done("erstinfo")} open={isOpen("erstinfo")} id="erstinfo" current={current === "erstinfo"}>
            <p className="mb-3 text-sm text-[color:var(--muted)]">
              Als Versicherungsvermittler müssen Sie Ihren Kunden beim ersten Kontakt die Erstinformation geben (§ 15 VersVermV), als PDF. Wir erstellen sie
              aus Ihrem Angebot und Impressum. Ihr Assistent schickt das PDF jedem neuen Lead per WhatsApp und hängt es an die Terminbestätigung per E-Mail. Bitte
              prüfen und bestätigen Sie die Angaben einmal.
            </p>
            {erstinfo.vollstaendig ? (
              <div className="mb-3 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-erstinfo-fertig>
                Ihre Erstinformation ist fertig: {vermittlerStatusLabel(erstinfo.status)}
                {erstinfo.registerNummer ? `, Registernummer ${erstinfo.registerNummer}` : ""}
                {erstinfo.fileName ? ", eigenes PDF hinterlegt" : ", aus Ihren Angaben erstellt"}.{impressumFehlt ? "" : " Sie müssen nichts tun."}
              </div>
            ) : (
              <p className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-erstinfo-warnung>
                Es fehlt noch: {erstinfo.fehlt.join(", ")}.
              </p>
            )}
            {impressumFehlt ? (
              <div className="mb-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-impressum-fehlt>
                <p className="mb-3">Tragen Sie Ihr Impressum ein, sonst zeigen Ihre Seiten für Kunden nur die Erstinformation als Anbieterangaben.</p>
                <ImpressumUrlForm readOnly={readOnly} />
              </div>
            ) : null}
            {erstinfo.vollstaendig ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-[color:var(--brand)]">Angaben ändern</summary>
                <div className="mt-3">
                  <ErstinfoForm
                    initial={{ status: erstinfo.status, registerNummer: erstinfo.registerNummer, fileName: erstinfo.fileName, daten: erstinfo.daten, anrede: erstinfo.anrede }}
                    impressum={erstinfo.impressum}
                    confirmed
                    readOnly={readOnly}
                  />
                </div>
              </details>
            ) : (
              <ErstinfoForm
                initial={{ status: erstinfo.status, registerNummer: erstinfo.registerNummer, fileName: erstinfo.fileName, daten: erstinfo.daten, anrede: erstinfo.anrede }}
                impressum={erstinfo.impressum}
                confirmed={!!erstinfo.bestaetigtAt}
                readOnly={readOnly}
              />
            )}
            {erstinfo.token ? (
              <p className="mt-4 text-sm text-[color:var(--muted)]">
                So sehen Ihre Leads sie:{" "}
                <a href={`/erstinformation/${erstinfo.token}/pdf`} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                  PDF öffnen
                </a>
              </p>
            ) : null}
            {logo ? <LogoZeile dataUri={logo.dataUri} bestaetigt={logo.bestaetigt} readOnly={readOnly} /> : null}
          </Step>
        ) : null}

        {soArbeitet ? (
          <Step n={nextNo()} title="So arbeitet Ihr Assistent" icon={Route} done={done("assistent")} open={isOpen("assistent")} id="assistent" current={current === "assistent"}>
            <SoArbeitet d={soArbeitet} produktHref={(p) => `/buyer/einrichtung?schritt=assistent&produkt=${encodeURIComponent(p)}#assistent`} />
            {!done("assistent") ? <WeiterButton kind="gesehen:assistent" next={laterHref("assistent")} readOnly={readOnly} /> : null}
          </Step>
        ) : null}

        {software ? (
          <Step n={nextNo()} title="Service-Mails in Ihrem Namen" icon={Mail} done={done("serviceMails")} open={isOpen("serviceMails")} id="serviceMails" current={current === "serviceMails"}>
            {mails ? (
              <ServiceMails {...mails} canEdit={!readOnly} weiterHref={laterHref("serviceMails")} />
            ) : (
              <p className="text-sm text-[color:var(--muted)]" data-service-mails-fertig>
                {ob.customer.mailFeaturesOff ? "E-Mail-Funktionen sind aus: Sie kopieren die Texte im Kontakt oder öffnen sie im eigenen Mailprogramm." : "Eingerichtet: Terminbestätigung und Erinnerungen gehen in Ihrem Namen raus."}{" "}
                <Link href="/buyer/einstellungen/assistent#mails" className="font-medium text-[color:var(--brand)] underline">
                  Ändern unter Einstellungen → Assistent
                </Link>
              </p>
            )}
          </Step>
        ) : null}

        {bdFragen ? (
          <section
            id="beratungsdoku"
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]"
            data-einrichtung-frage="beratungsdoku"
          >
            <div className="flex items-start gap-2.5 px-5 pb-3 pt-3.5">
              <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold tracking-tight">{BD_FRAGE_TITEL}</h2>
                <p className="mt-0.5 text-sm text-[color:var(--muted)]">{BD_FRAGE_TEXT}</p>
              </div>
            </div>
            <BeratungsdokuEinrichtungFrage darf={!readOnly} />
          </section>
        ) : bdAn !== null ? (
          <details
            id="beratungsdoku"
            open={schritt === "beratungsdoku"}
            className="group overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] [&>summary::-webkit-details-marker]:hidden"
            data-einrichtung-optional="beratungsdoku"
          >
            <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-3.5 group-open:border-b group-open:border-[color:var(--border)]">
              <ClipboardCheck className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              <span className="flex-1 text-[15px] font-semibold tracking-tight">Beratungsdokumentation</span>
              <span className="text-xs font-medium text-[color:var(--muted)]">{bdAn ? "an" : "aus"}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
            </summary>
            <BeratungsdokuSchalter an={bdAn} darf={!readOnly} />
          </details>
        ) : null}

        {makler && software ? (
          vvVersand ? (
            <details
              id="maklervollmacht"
              open={schritt === "maklervollmacht"}
              className="group overflow-hidden rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] bg-[color:var(--surface)] [&>summary::-webkit-details-marker]:hidden"
              data-einrichtung-optional="maklervollmacht"
            >
              <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-3.5 group-open:border-b group-open:border-[color:var(--border)]">
                <FileSignature className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                <span className="flex-1 text-[15px] font-semibold tracking-tight">Maklervollmacht</span>
                <span className="text-xs font-medium text-[color:var(--muted)]">{vvVersand === "app" ? "die App schickt sie" : "eigene Vollmacht"}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
              </summary>
              <div className="p-5">
                <VollmachtVersandWahl wert={vvVersand} darf={!readOnly} />
              </div>
            </details>
          ) : (
            <section
              id="maklervollmacht"
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]"
              data-einrichtung-frage="maklervollmacht"
            >
              <div className="flex items-start gap-2.5 px-5 pb-3 pt-3.5">
                <FileSignature className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand)]" />
                <h2 className="min-w-0 flex-1 text-[15px] font-semibold tracking-tight">{VERSAND_FRAGE}</h2>
              </div>
              <div className="px-5 pb-4">
                <VollmachtVersandWahl wert={null} darf={!readOnly} />
              </div>
            </section>
          )
        ) : null}

        <Step n={nextNo()} title="Meta freigeben (Werbekonto und Seite)" icon={KeyRound} done={done("metaAccess")} open={isOpen("metaAccess")} id="metaAccess" current={current === "metaAccess"}>
          <p className="text-sm text-[color:var(--muted)]">So schalten wir die Anzeigen in Ihrem Werbekonto und Leads kommen direkt bei Ihnen an. Das Budget bleibt bei Ihnen.</p>
          <VideoHint url={video("metaAccess")} />
          <p className="mt-4 text-[15px] font-medium">So geben Sie uns Zugriff (ca. 3 Minuten)</p>
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
              Ihr <b>Werbekonto</b> (Kampagnen verwalten), Ihre <b>Facebook-Seite</b> mit <b>„Volle Kontrolle“</b> (nötig, damit Leads direkt
              bei Ihnen ankommen) und Ihren <b>Datensatz (Pixel)</b> mit voller Kontrolle bzw. <b>„Verwalten“</b> auswählen, ggf. auch Instagram,
              und speichern.
            </li>
          </ol>
          <p className="text-sm text-[color:var(--muted)]">
            Über den Datensatz erfährt Meta, welche Ihrer Leads zu Terminen und Verträgen werden, und kann die Anzeigen danach ausrichten.
          </p>
          <details className="my-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3 text-[15px]" data-dataset-help>
            <summary className="cursor-pointer font-medium">Noch keinen Datensatz? So legen Sie ihn an</summary>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>
                <a href="https://business.facebook.com/events_manager2" target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                  Meta Events Manager
                </a>{" "}
                öffnen.
              </li>
              <li>
                Links auf <b>Datenquellen verbinden</b> (bzw. <b>„+“ → Neue Datenquelle hinzufügen</b>) tippen und <b>Web</b> wählen.
              </li>
              <li>Einen Namen eingeben, z. B. den Namen Ihrer Agentur, und den Datensatz erstellen. Eine Webseite brauchen Sie dafür nicht.</li>
              <li>
                Den Datensatz Ihrem <b>Werbekonto</b> zuordnen (in den Einstellungen des Datensatzes oder unter{" "}
                <b>Business-Einstellungen → Datenquellen → Datensätze → Assets verbinden</b>).
              </li>
              <li>Danach wie oben unter Partner für unser Business freigeben (Schritt 4).</li>
            </ol>
          </details>
          <div className="my-4">
            <p className="mb-3 text-[15px] font-medium">Dann Werbekonto und Seite eintragen und prüfen</p>
            <MetaAccessForm
              initial={{ adAccount: metaInit.adAccount, page: metaInit.page }}
              lastCheck={(ob.metaCheck ?? null) as MetaCheck | null}
              readOnly={readOnly}
            />
          </div>
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
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[color:var(--muted)]">
              <span>Schnelle Frage zwischendurch?</span>
              <HilfeChatButton className="inline-flex items-center gap-1.5 font-semibold text-[color:var(--brand)]" />
              <span>Sie antwortet sofort, auch abends.</span>
            </div>
          </div>
        </Step>

        {waEnabled ? (
          <Step n={nextNo()} title="WhatsApp verbinden" icon={MessageCircle} done={done("whatsapp")} open={isOpen("whatsapp") || !!wa || !!weg} id="whatsapp" current={current === "whatsapp"}>
            <VideoHint url={video("whatsapp")} />
            <WhatsAppStep wa={wa} weg={weg} account={waAccount} done={done("whatsapp")} readOnly={readOnly} email={ctx.email} />
            {!done("whatsapp") ? (
              <StepExits
                laterHref={laterHref("whatsapp")}
                readOnly={readOnly}
                skips={[
                  { kind: "skip:whatsapp:gesellschaft", label: "Mein Versicherer erlaubt das nicht" },
                  { kind: "skip:whatsapp:nicht_noetig", label: "Ohne WhatsApp arbeiten" },
                ]}
              />
            ) : null}
          </Step>
        ) : null}

        {has("bestandImport") ? (
          <Step n={nextNo()} title="Kundenliste hochladen" icon={Upload} done={done("bestandImport")} open={isOpen("bestandImport")} id="bestandImport" current={current === "bestandImport"}>
            <p className="text-sm text-[color:var(--muted)]">
              Für Ihre Bestandskunden-Kampagnen: Laden Sie Ihre Kundenliste als Excel oder CSV hoch. Die App erkennt die Spalten und zeigt vorher eine Vorschau.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href="/buyer/bestand/import" className={buttonClass("primary", "md")}>
                Kundenliste hochladen
              </Link>
            </div>
            {!done("bestandImport") ? <StepExits laterHref={laterHref("bestandImport")} readOnly={readOnly} skips={[{ kind: "skip:bestandImport:spaeter", label: "Mache ich später selbst" }]} /> : null}
          </Step>
        ) : null}

        {has("reviewLink") ? (
          <Step n={nextNo()} title="Google-Bewertungslink hinterlegen" icon={Star} done={done("reviewLink")} open={isOpen("reviewLink")} id="reviewLink" current={current === "reviewLink"}>
            <p className="text-sm text-[color:var(--muted)]">
              Für Empfehlungen und Bewertungen: Mit Ihrem Link „Bewertung schreiben“ aus dem Google-Unternehmensprofil bittet die App zufriedene Kunden um eine Bewertung.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href="/buyer/empfehlungen" className={buttonClass("primary", "md")}>
                Link hinterlegen
              </Link>
            </div>
            {!done("reviewLink") ? (
              <StepExits laterHref={laterHref("reviewLink")} readOnly={readOnly} skips={[{ kind: "skip:reviewLink:nicht_noetig", label: "Ich habe kein Google-Profil" }]} />
            ) : null}
          </Step>
        ) : null}

        {has("team") ? (
          <Step n={nextNo()} title="Team einladen" icon={Users} done={done("team")} open={isOpen("team")} id="team" current={current === "team"}>
            <p className="text-sm text-[color:var(--muted)]">Laden Sie Ihre Berater ein. Jeder bekommt einen eigenen Login und sieht nur seine Leads.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href="/buyer/team" className={buttonClass("primary", "md")}>
                Berater einladen
              </Link>
            </div>
            {!done("team") ? <StepExits laterHref={laterHref("team")} readOnly={readOnly} skips={[{ kind: "skip:team:spaeter", label: "Mache ich später" }]} /> : null}
          </Step>
        ) : null}

        <Step n={nextNo()} title="Start" icon={Rocket} done={!!ob.liveAt} open={current === "start"} current={current === "start" && !ob.liveAt}>
          {software && waVerbunden && !ob.liveAt ? (
            <div className="mb-4">
              <TestleadSelbst phone={eiTel} readOnly={readOnly} schonGetestet={!!ob.testLeadAt} />
            </div>
          ) : null}
          <p className="text-sm text-[color:var(--muted)]">
            {ob.startDate ? `Am ${dateFmt(ob.startDate)} ` : "Zum Start "}
            gehen die Anzeigen live.{" "}
            {software
              ? "Neue Leads bekommen innerhalb weniger Minuten eine WhatsApp-Nachricht und können direkt einen Termin buchen."
              : "Jeder neue Lead kommt sofort per E-Mail und steht hier im Kundenbereich unter „Leads“."}
          </p>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Ihr Werbebudget können Sie jederzeit selbst anpassen:{" "}
            <Link href="/buyer/wachstum#budget" className="font-medium text-[color:var(--brand)] underline">
              Budget ändern
            </Link>
          </p>
          <p className="mt-2 text-sm text-[color:var(--muted)]" data-start-monatsbericht>
            Anfang jedes Monats bekommen Sie Ihren Monatsbericht per E-Mail: Leads, Termine, Abschlüsse und Gewinn im Vergleich zum Vormonat. Alle Berichte finden
            Sie unter{" "}
            <Link href="/buyer/zahlen#monatsberichte" className="font-medium text-[color:var(--brand)] underline">
              Zahlen → Monatsberichte
            </Link>
            .
          </p>
        </Step>
      </div>
      {/* Einführungsvideo unter den Schritten, damit am Handy der nächste Schritt auf den ersten Bildschirm passt (UX-Runde 19.11.2026) */}
      {newUi && !readOnly ? (
        <p className="mt-5 text-sm">
          <Link href="/buyer/einfuehrung" className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-[color:var(--brand)]" data-einrichtung-video>
            <PlayCircle className="h-4 w-4" /> So arbeiten Sie mit der Software: Einführungsvideo (ca. 3 Minuten)
          </Link>
        </p>
      ) : null}
    </main>
  );
}

/** Unser Teil der Einrichtung – nur zur Info, zählt nicht in den Fortschritt des Kunden. */
function OurPart({ ours, startDate }: { ours: { key: string; done: boolean }[]; startDate: Date | null }) {
  const short = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "long" });
  const label = (k: string) =>
    k === "whatsapp" ? "WhatsApp verbinden" : k === "campaign" ? "Kampagne & Leadformular" : k === "testLead" ? "Testlead" : startDate ? `Go-live am ${short.format(startDate)}` : "Go-live";
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

/** Kurzes Erklärvideo je Schritt (Loom/YouTube eingebettet, sonst als Link). Ohne Video nichts. */
function VideoHint({ url }: { url: string | null }) {
  if (!url) return null;
  const embed = videoEmbedUrl(url);
  return embed ? (
    <div className="my-3 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)]">
      <iframe src={embed} title="Kurzes Erklärvideo" className="aspect-video w-full" allow="fullscreen; picture-in-picture" loading="lazy" />
    </div>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className="my-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)]">
      <PlayCircle className="h-4 w-4" /> Kurzes Erklärvideo ansehen
    </a>
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
  current = false,
  children,
}: {
  /** Nächster offener Schritt: hervorgehoben mit „Als Nächstes“ (UX-Runde 19.11.2026). */
  current?: boolean;
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
    <details
      id={id}
      open={open}
      data-schritt-aktuell={current ? "" : undefined}
      className={`group scroll-mt-20 overflow-hidden rounded-[var(--radius-lg)] border bg-[color:var(--surface)] shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden ${current ? "border-[color:var(--brand)] ring-2 ring-[color:var(--brand)]/15" : "border-[color:var(--border)]"}`}
    >
      <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-3.5 group-open:border-b group-open:border-[color:var(--border)]">
        {done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Icon className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />}
        <span className={`flex-1 text-[15px] font-semibold tracking-tight ${done ? "text-[color:var(--muted)]" : ""}`}>
          {n}. {title}
        </span>
        {done ? <span className="text-xs font-semibold text-emerald-700">erledigt</span> : current ? <span className="text-xs font-semibold text-[color:var(--brand)]">Als Nächstes</span> : null}
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
  invited: { ok: true, text: "Ihr Konto bei 360dialog ist angelegt. Bitte öffnen Sie jetzt die E-Mail von 360dialog und legen Sie Ihr Passwort fest." },
};

/** Schritt „WhatsApp verbinden“: Erklärung, Knopf zum 360dialog-Onboarding, Status. */
function WhatsAppStep({
  wa,
  weg,
  account,
  done,
  readOnly,
  email,
}: {
  email: string;
  wa?: string;
  weg?: string;
  account: { status: string; phoneNumber: string | null; dialog360ChannelId: string | null } | null;
  done: boolean;
  readOnly: boolean;
}) {
  const invitedNow = !done && account?.status === "invited";
  // Bei offener Einladung erklärt der Schritt selbst alles, die grüne Meldung wäre doppelt.
  const msg = wa && !(wa === "invited" && invitedNow) ? WA_MESSAGES[wa] : undefined;
  const pending = !done && account?.status === "pending" && !!account.dialog360ChannelId;
  const invited = invitedNow;
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
      ) : invited ? (
        <div>
          <WaInvited email={email} readOnly={readOnly} path={parseConnectPath(weg)} />
          <WaCheckButton readOnly={readOnly} />
          <WaResetButton readOnly={readOnly} />
        </div>
      ) : msg?.ok ? null : pending ? (
        <p className="text-sm font-medium text-amber-700">
          Fast geschafft: Ihre Nummer wird bei WhatsApp noch eingerichtet. Das dauert meist nur wenige Minuten, dann steht hier von selbst „Verbunden“. Sie müssen nichts weiter tun, wir melden uns, falls etwas fehlt.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-[color:var(--muted)]">
            Über diese Nummer schreibt Ihr Assistent neuen Leads in Ihrem Namen. Das Verbinden machen Sie einmal, es dauert etwa 10 Minuten.
          </p>
          <div className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken,#f8fafc)] px-4 py-3" data-wa-checklist>
            <p className="text-[15px] font-medium">Vorher kurz prüfen:</p>
            <ul className="mt-2 space-y-1.5 text-[15px]">
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> <span>Eine Nummer, die <b>nicht</b> in der normalen WhatsApp-App genutzt wird (z. B. zweite SIM, Festnetz oder neue Nummer).</span></li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> Sie können an dieser Nummer jetzt eine SMS oder einen Anruf mit Bestätigungscode empfangen.</li>
              <li className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" /> Sie sind bei Facebook angemeldet und Admin Ihres Business Managers.</li>
            </ul>
          </div>
          <WhatsAppGuide initialPath={parseConnectPath(weg)} readOnly={readOnly} helpHref="/buyer/einrichtung?schritt=metaAccess#hilfetermin" />
          <WaCheckButton readOnly={readOnly} />
        </>
      )}
      {pending ? (
        <>
          <WaPendingRefresh />
          <WaCheckButton readOnly={readOnly} intro={false} />
          <WaResetButton readOnly={readOnly} />
        </>
      ) : null}
    </>
  );
}
