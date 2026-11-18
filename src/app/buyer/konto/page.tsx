import { redirect } from "next/navigation";
import Link from "next/link";
import { Bell, CreditCard, Download, FileText, Package, Puzzle, Star, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { FreePeriodNotices } from "@/components/free-period-notices";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { billingEnabled, listCustomerInvoices, type CustomerInvoice } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { openPortalAction, paymentSetupAction, retentionAction } from "./actions";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";
import { LeadEmailToggle } from "./pause-card";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";
import { ModuleBookButton, ModuleCancelButton } from "@/components/bestand/module-book";
import { canSelfBookBestand } from "@/lib/bestand/self-service";
import { bestandPacksText, normalizeRhythmus, PRICE_LIST, RHYTHMUS_MONATE, rhythmusFaktor, TERM_MONTHS, normalizeTerm } from "@/lib/offer-pricing";
import { currentPause, todayBerlin } from "@/lib/pause";
import { EmpfehlungBookButton, EmpfehlungCancelButton } from "@/components/empfehlung/client";
import { empfehlungVisible, moduleState, showNewBadge, trialAvailable } from "@/lib/empfehlung/shared";
import { includedPhrase } from "@/lib/seats";
import { contractCancelInfo } from "@/lib/vertrag-kuendigung";
import { helpCallSlots } from "@/lib/help-call";
import { VertragKuendigen } from "./vertrag-kuendigen";
import { Aufbewahrung } from "./aufbewahrung";
import { loadRetentionView } from "@/lib/ruhend";
import { loadHalteKonto } from "@/lib/halteangebote-server";
import { fmtIso } from "@/lib/vertrag-laufzeit";
import { bestandVisible } from "@/lib/bestand/sichtbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Konto & Rechnungen | performancegrowth" };

const TZ = "Europe/Berlin";
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  paid: { label: "Bezahlt", tone: "success" },
  open: { label: "Offen", tone: "warning" },
  uncollectible: { label: "Nicht einziehbar", tone: "danger" },
  void: { label: "Storniert", tone: "neutral" },
};

const PORTAL_MSG: Record<string, string> = {
  vorschau: "In der Vorschau nicht möglich.",
  fehlt: "Für Ihr Konto ist noch keine Online-Zahlung hinterlegt. Bitte melden Sie sich kurz bei uns.",
  fehler: "Das hat gerade nicht geklappt. Bitte versuchen Sie es gleich noch einmal.",
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ portal?: string; modul?: string; zahlung?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");
  const { portal, modul, zahlung } = await searchParams;
  const customer = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: {
      name: true,
      plan: true,
      retainerMonthly: true,
      retainerStart: true,
      stripeCustomerId: true,
      leadEmail: true,
      seatsIncluded: true,
      seatMonthly: true,
      seatsBilled: true,
      isTest: true,
      billingInterval: true,
      bestandMonthly: true,
      existingCustomersEnabled: true,
      bestandSichtbar: true,
      bestandRequestedAt: true,
      bestandCancelAt: true,
      paymentOverdueSince: true,
      empfehlungEnabled: true,
      empfehlungMonthly: true,
      empfehlungTrialEndsAt: true,
      empfehlungFree: true,
      empfehlungCancelAt: true,
      empfehlungSince: true,
      whatsAppAccount: { select: { id: true } },
      onboarding: { select: { offerId: true, questionnaire: true } },
    },
  });
  if (!customer) redirect("/buyer");
  const offer = customer.onboarding?.offerId
    ? await prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { term: true, softwareFee: true, number: true, token: true, annualFreeMonths: true } })
    : null;

  let invoices: CustomerInvoice[] = [];
  if (customer.stripeCustomerId && billingEnabled()) {
    invoices = await listCustomerInvoices(customer.stripeCustomerId).catch((err) => {
      reportError(err, "billing-invoices", { customer: ctx.customerId });
      return [];
    });
  }
  const monthly = customer.retainerMonthly != null ? Number(customer.retainerMonthly) : null;
  // Bestandskunden-Modul vorerst nur für Kunden mit Schalter oder aktivem Modul (lib/bestand/sichtbar.ts)
  const showBestand = bestandVisible(customer, { admin: ctx.preview });
  const bestandCheck = showBestand && !customer.existingCustomersEnabled && customer.plan !== "service" ? await canSelfBookBestand(ctx.customerId) : null;
  const pause = await currentPause(ctx.customerId);
  // „Vertrag hier kündigen“: für alle Kunden mit Vertrag (Angebot oder Betreuung), nicht intern
  const cancelInfo = customer.plan !== "internal" && (offer || customer.retainerStart) ? await contractCancelInfo(ctx.customerId) : null;
  // Anti-Churn: freie 15-Minuten-Termine fürs Kündigungsfenster (nur wenn kündbar und noch nicht gekündigt)
  const churnSlots = cancelInfo && !cancelInfo.ended && !cancelInfo.requested && !ctx.preview ? await helpCallSlots().catch(() => []) : [];
  // Nach der Kündigung: Aufbewahrung der Daten nach Vertragsende (änderbar bis zur Löschung)
  const retention = cancelInfo?.requested ? await loadRetentionView(ctx.customerId) : null;
  // Halteangebot: angenommener Nachlass und Mindestlaufzeit danach
  const halte = await loadHalteKonto(ctx.customerId).catch(() => null);
  const today = todayBerlin();
  const service = customer.plan === "service";
  // Zusätze (weitere aktive Verkäufer, Bestandskunden-Modul) und Zahlweise
  // Testkunden (Testangebot 0 €) sehen den regulären Platzpreis wie echte Kunden, berechnet wird nichts
  const seatMonthly = customer.isTest ? PRICE_LIST.seatMonthly : customer.seatMonthly != null ? Number(customer.seatMonthly) : null;
  const seatsFee = seatMonthly && !customer.isTest ? customer.seatsBilled * seatMonthly : 0;
  const bestandFee = customer.bestandMonthly != null ? Number(customer.bestandMonthly) : 0;
  const empfehlungFee = customer.empfehlungMonthly != null ? Number(customer.empfehlungMonthly) : 0;
  const empfehlungState = moduleState(customer);
  const showEmpfehlung = empfehlungVisible(empfehlungState !== "inactive");
  const monthlyTotal = monthly != null ? monthly + seatsFee + bestandFee + empfehlungFee : null;
  // Vorauszahlung: jährlich (12 Monate) oder 6 Monate im Voraus (Laufzeit 6 Monate)
  const rhythmus = normalizeRhythmus(customer.billingInterval);
  const annual = rhythmus !== "month";
  const prepayMonths = RHYTHMUS_MONATE[rhythmus];
  const prepayFree = annual ? prepayMonths - rhythmusFaktor(rhythmus, offer?.annualFreeMonths) : 0;
  const yearly = annual && monthlyTotal != null ? monthlyTotal * rhythmusFaktor(rhythmus, offer?.annualFreeMonths) : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="Konto & Rechnungen" subtitle={customer.name} />
      <FreePeriodNotices customerId={ctx.customerId} readOnly={ctx.preview} />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Ihr Vertrag" icon={Package} />
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2 p-5 text-[15px]">
            <dt className="text-[color:var(--muted)]">Paket</dt>
            <dd>{service ? "Leadgenerierung (Betreuung)" : "Leadgenerierung + Software"}</dd>
            {monthly != null ? (
              <>
                <dt className="text-[color:var(--muted)]">{seatsFee || bestandFee || empfehlungFee ? "Paket monatlich" : "Monatlich"}</dt>
                <dd>{eur(monthly)} netto zzgl. USt.</dd>
              </>
            ) : null}
            {customer.seatsIncluded != null ? (
              <>
                <dt className="text-[color:var(--muted)]">Verkäufer</dt>
                <dd data-konto-seats>
                  {includedPhrase(customer.seatsIncluded)}
                  {seatMonthly && customer.seatsBilled > 0 ? `, ${customer.seatsBilled} ${customer.seatsBilled === 1 ? "weiterer" : "weitere"} je ${eur(seatMonthly)} = ${eur(seatsFee)} im Monat` : ""}
                  {seatMonthly === 0 ? " · weitere nach Sondervereinbarung" : ""}
                </dd>
              </>
            ) : null}
            {customer.existingCustomersEnabled ? (
              <>
                <dt className="text-[color:var(--muted)]">Bestandskunden</dt>
                <dd className="space-y-2">
                  <div>{bestandFee ? `Modul gebucht, ${eur(bestandFee)} im Monat` : "Modul freigeschaltet"}</div>
                  {customer.bestandMonthly != null ? (
                    <ModuleCancelButton cancelAt={customer.bestandCancelAt?.toISOString() ?? null} readOnly={ctx.preview} annual={annual} prepayMonths={prepayMonths} />
                  ) : null}
                </dd>
              </>
            ) : null}
            {empfehlungState !== "inactive" ? (
              <>
                <dt className="text-[color:var(--muted)]">Empfehlungen</dt>
                <dd>
                  {empfehlungState === "trial"
                    ? `Testphase bis ${date(customer.empfehlungTrialEndsAt!)}, danach ${eur(PRICE_LIST.empfehlungModuleMonthly)} im Monat`
                    : empfehlungFee
                      ? `Modul gebucht, ${eur(empfehlungFee)} im Monat`
                      : "Modul freigeschaltet"}
                </dd>
              </>
            ) : null}
            {monthlyTotal != null && (seatsFee || bestandFee || empfehlungFee) ? (
              <>
                <dt className="text-[color:var(--muted)]">Monatlich gesamt</dt>
                <dd className="font-semibold">{eur(monthlyTotal)} netto zzgl. USt.</dd>
              </>
            ) : null}
            {monthly != null ? (
              <>
                <dt className="text-[color:var(--muted)]">Zahlweise</dt>
                <dd data-konto-interval>
                  {annual && yearly != null
                    ? `${prepayMonths === 6 ? "6 Monate im Voraus" : "Jährlich im Voraus"}: ${eur(yearly)} netto (${prepayFree} ${prepayFree === 1 ? "Monat" : "Monate"} geschenkt)`
                    : "Monatlich"}
                </dd>
              </>
            ) : null}
            {PRICE_LIST.whatsappIncluded && customer.whatsAppAccount ? (
              <>
                <dt className="text-[color:var(--muted)]">WhatsApp-Gebühren</dt>
                <dd>Im Preis enthalten</dd>
              </>
            ) : null}
            {customer.retainerStart ? (
              <>
                <dt className="text-[color:var(--muted)]">Start</dt>
                <dd>{date(customer.retainerStart)}</dd>
              </>
            ) : null}
            {halte ? (
              <>
                <dt className="text-[color:var(--muted)]">Nachlass</dt>
                <dd data-konto-halteangebot>
                  {halte.percentOff && halte.months
                    ? `${halte.percentOff} % auf ${halte.months === 1 ? "eine Monatsrechnung" : `${halte.months} Monatsrechnungen`}${halte.acceptedIso ? ` (angenommen am ${fmtIso(halte.acceptedIso)})` : ""}. `
                    : ""}
                  Mindestlaufzeit bis {fmtIso(halte.commitIso)}.
                </dd>
              </>
            ) : null}
            {offer ? (
              <>
                <dt className="text-[color:var(--muted)]">Laufzeit</dt>
                <dd>
                  {annual
                    ? `${prepayMonths} Monate, verlängert sich um ${prepayMonths} Monate, wenn nicht 1 Monat vor Ende gekündigt`
                    : TERM_MONTHS[normalizeTerm(offer.term)] > 0
                      ? `${TERM_MONTHS[normalizeTerm(offer.term)]} Monate, danach monatlich kündbar`
                      : "Monatlich kündbar"}
                </dd>
                <dt className="text-[color:var(--muted)]">Pause / Urlaub</dt>
                <dd>Jederzeit selbst einstellbar (siehe unten)</dd>
                <dt className="text-[color:var(--muted)]">Vertrag</dt>
                <dd>
                  <a href={`/angebot/${offer.token}`} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                    Angebot {offer.number} ansehen
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          {cancelInfo && !cancelInfo.ended ? (
            <div className="border-t border-[color:var(--border)] px-5 py-4" id="kuendigen" data-konto-kuendigen>
              <VertragKuendigen
                requested={cancelInfo.requested ? { atIso: cancelInfo.requested.atIso, effectiveIso: cancelInfo.requested.effectiveIso } : null}
                nextText={cancelInfo.nextText}
                customerName={customer.name}
                email={ctx.email}
                readOnly={ctx.preview}
                slots={churnSlots}
                hasModules={!!(customer.existingCustomersEnabled || customer.empfehlungEnabled)}
                canPause={!pause}
              />
              {retention?.endIso && retention.choice ? (
                <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-konto-aufbewahrung>
                  <div className="mb-2 font-semibold">Ihre Daten nach Vertragsende</div>
                  <Aufbewahrung endIso={retention.endIso} choice={retention.choice} todayIso={today} readOnly={ctx.preview} action={retentionAction} />
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {/* Werbebudget, Produkte und Pause stehen unter „Wachstum“ (UX, Ole 15.11.2026): ein Ort je Thema */}
        <Link href="/buyer/wachstum#budget" className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-[15px] hover:border-[color:var(--brand)]" data-konto-wachstum>
          <span>Werbebudget, Produkte und Pause</span>
          <span className="text-sm font-medium text-[color:var(--brand)]">Unter Wachstum</span>
        </Link>

        {customer.whatsAppAccount && !PRICE_LIST.whatsappIncluded ? <WhatsAppFeesCard customerId={ctx.customerId} /> : null}

        {!service && (showEmpfehlung || showBestand || customer.seatsIncluded != null) ? (
          <Card>
            <div id="zusatzmodule" className="scroll-mt-20" />
            <CardHeader title="Zusatzmodule" icon={Puzzle} />
            <ul className="divide-y divide-[color:var(--border)] text-sm" data-konto-module>
              {showEmpfehlung ? (
              <li className="space-y-3 px-5 py-4" data-konto-empfehlung>
                <div className="flex flex-wrap items-center gap-2">
                  <Star className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold">Empfehlungen &amp; Bewertungen</span>
                  {showNewBadge() && empfehlungState === "inactive" ? <Badge tone="success">Neu</Badge> : null}
                  <span className="ml-auto text-[color:var(--muted)]">{eur(PRICE_LIST.empfehlungModuleMonthly)} netto/Monat</span>
                </div>
                <p className="text-[color:var(--muted)]">
                  Nach jedem Abschluss mit Einverständnis des Kunden um eine ehrliche Google-Bewertung und später um eine Empfehlung bitten, Kritik landet zuerst bei Ihnen. Mit
                  Auswertung: Empfehlungs-Leads, Abschlüsse und Provision.
                </p>
                {empfehlungState === "inactive" ? (
                  <EmpfehlungBookButton
                    trial={trialAvailable(customer)}
                    annual={annual}
                    prepayMonths={prepayMonths}
                    monthly={PRICE_LIST.empfehlungModuleMonthly}
                    readOnly={ctx.preview}
                    autoOpen={modul === "empfehlung"}
                    reason={customer.paymentOverdueSince ? "Es ist noch eine Rechnung offen. Bitte melden Sie sich kurz bei uns." : null}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="success">
                      {empfehlungState === "trial" ? `Testphase bis ${date(customer.empfehlungTrialEndsAt!)}` : empfehlungState === "free" ? "Inklusive" : "Aktiv"}
                    </Badge>
                    <Link href="/buyer/empfehlungen" className={buttonClass("primary", "sm")}>
                      Einstellungen &amp; Auswertung
                    </Link>
                    {empfehlungState !== "free" ? (
                      <EmpfehlungCancelButton
                        cancelAt={customer.empfehlungCancelAt?.toISOString() ?? null}
                        trialEndsAt={customer.empfehlungMonthly == null ? (customer.empfehlungTrialEndsAt?.toISOString() ?? null) : null}
                        readOnly={ctx.preview}
                        annual={annual}
                        prepayMonths={prepayMonths}
                      />
                    ) : null}
                  </div>
                )}
              </li>
              ) : null}
              {showBestand ? (
              <li className="space-y-3 px-5 py-4" data-konto-bestand>
                <div className="flex flex-wrap items-center gap-2">
                  <Users className="h-4 w-4 text-[color:var(--brand)]" />
                  <span className="font-semibold">Bestandskunden-Modul</span>
                  <span className="ml-auto text-[color:var(--muted)]">{eur(PRICE_LIST.bestandModuleMonthly)} netto/Monat</span>
                </div>
                <p className="text-[color:var(--muted)]">
                  Kundenliste hochladen, Lücken und Anlässe erkennen, passende Kunden per WhatsApp anschreiben. WhatsApp-Gebühren für bis zu{" "}
                  {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat inklusive. Mehr mit Zusatzpaketen unter{" "}
                  <b>Bestand</b>: {bestandPacksText()}.
                </p>
                {customer.existingCustomersEnabled ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge tone="success">{bestandFee ? "Aktiv" : "Inklusive"}</Badge>
                    <Link href="/buyer/bestand" className={buttonClass("primary", "sm")}>
                      Zum Bestand
                    </Link>
                  </div>
                ) : (
                  <ModuleBookButton
                    monthlyNet={PRICE_LIST.bestandModuleMonthly}
                    includedMessages={PRICE_LIST.bestandIncludedMessages}
                    canBook={bestandCheck?.ok ?? false}
                    reason={bestandCheck && !bestandCheck.ok ? bestandCheck.reason : null}
                    requestedAt={customer.bestandRequestedAt?.toISOString() ?? null}
                    readOnly={ctx.preview}
                    annual={annual}
                    freeMonths={prepayMonths === 6 ? PRICE_LIST.halfYearFreeMonths : PRICE_LIST.annualFreeMonths}
                    prepayMonths={prepayMonths}
                  />
                )}
              </li>
              ) : null}
              {customer.seatsIncluded != null ? (
                <li className="space-y-2 px-5 py-4" data-konto-seats-module>
                  <div className="flex flex-wrap items-center gap-2">
                    <UserPlus className="h-4 w-4 text-[color:var(--brand)]" />
                    <span className="font-semibold">Weitere Verkäufer</span>
                    <span className="ml-auto text-[color:var(--muted)]">
                      {seatMonthly ? `${eur(seatMonthly)} netto/Monat je weiterem Verkäufer${customer.isTest ? " (Testkonto: wird nicht berechnet)" : ""}` : "nach Sondervereinbarung"}
                    </span>
                  </div>
                  <p className="text-[color:var(--muted)]">
                    {includedPhrase(customer.seatsIncluded)}. Aktiv ist, wer Leads bekommt. Mitglieder ohne Leads (z. B. Inhaber, der nur steuert) sind kostenlos.
                    Weitere Verkäufer legen Sie selbst im Team an, sie werden tagesgenau berechnet.
                  </p>
                  <Link href="/buyer/team" className={buttonClass("secondary", "sm")}>
                    Zum Team
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>
        ) : null}

        {customer.onboarding ? (
          <Card>
            <CardHeader title="Benachrichtigungen" icon={Bell} />
            <div className="p-5">
              <LeadEmailToggle
                enabled={customer.leadEmail}
                email={((customer.onboarding.questionnaire ?? {}) as { leadEmails?: string[] }).leadEmails?.join(", ") || ctx.email}
                readOnly={ctx.preview}
              />
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Zahlung und Rechnungsdaten" icon={CreditCard} />
          <div className="p-5">
            {zahlung === "ok" ? (
              <p className="mb-3 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Danke, Ihre Zahlungsart ist hinterlegt und gilt ab der nächsten Rechnung.
              </p>
            ) : null}
            {portal && PORTAL_MSG[portal] ? <p className="mb-3 text-sm font-medium text-rose-700">{PORTAL_MSG[portal]}</p> : null}
            {billingEnabled() && customer.stripeCustomerId ? (
              <form action={paymentSetupAction} className="max-w-md space-y-4" data-konto-zahlart>
                <ZahlartAuswahl />
                <button
                  type="submit"
                  disabled={ctx.preview}
                  className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
                >
                  Zahlungsart hinterlegen
                </button>
              </form>
            ) : null}
            {/* Ohne Online-Zahlung kein grauer Knopf ohne Ziel, sondern der Weg (UX Runde 4) */}
            {customer.stripeCustomerId ? (
              <>
                <p className={`${billingEnabled() ? "mt-5" : ""} text-sm text-[color:var(--muted)]`}>Rechnungsadresse, USt-IdNr. und gespeicherte Zahlungsarten:</p>
                <form action={openPortalAction} className="mt-2">
                  <button type="submit" disabled={ctx.preview} className={buttonClass("secondary", "md")}>
                    Rechnungsdaten ändern
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-[color:var(--muted)]" data-konto-ohne-online-zahlung>
                Sie zahlen per Rechnung. Für eine neue Rechnungsadresse oder USt-IdNr. schreiben Sie uns über „Hilfe“.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Rechnungen" icon={FileText} count={invoices.length || undefined} />
          {invoices.length === 0 ? (
            <p className="p-5 text-sm text-[color:var(--muted)]">
              {customer.stripeCustomerId ? "Noch keine Rechnungen." : "Ihre Rechnungen erhalten Sie per E-Mail."}
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {invoices.map((inv) => {
                const st = STATUS[inv.status ?? ""] ?? { label: inv.status ?? "", tone: "neutral" as const };
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-[15px]">
                    <span className="font-medium">{inv.number ?? "Rechnung"}</span>
                    <span className="text-[color:var(--muted)]">{date(inv.created)}</span>
                    <span className="tabular-nums">{eur(inv.total)}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <span className="ml-auto flex gap-3 text-sm">
                      {inv.status === "open" && inv.hostedUrl ? (
                        <a href={inv.hostedUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                          Jetzt bezahlen
                        </a>
                      ) : null}
                      {inv.pdfUrl ? (
                        <a href={inv.pdfUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                          PDF
                        </a>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Ihre Daten herunterladen" icon={Download} />
          <div className="space-y-3 px-5 pb-5 text-sm" data-konto-export>
            <p className="text-[color:var(--muted)]">
              Alle Leads, Abschlüsse, Termine und Chats als ZIP mit Excel-Dateien. Nach Vertragsende bewahren wir sie 24 Monate auf, eine frühere
              Löschung wählen Sie bei der Kündigung.
            </p>
            <a href="/buyer/konto/export" className={buttonClass("secondary", "md")} data-konto-export-download>
              <Download className="h-4 w-4" /> Daten herunterladen (ZIP)
            </a>
          </div>
        </Card>
      </div>
    </main>
  );
}
