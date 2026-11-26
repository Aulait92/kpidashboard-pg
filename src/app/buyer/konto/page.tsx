import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, FileText, Package, Puzzle, Star, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { FreePeriodNotices } from "@/components/free-period-notices";
import { Badge, Card, CardHeader, buttonClass } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { billingEnabled, listCustomerInvoices, type CustomerInvoice } from "@/lib/billing";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { openPortalAction, paymentSetupAction, retentionAction } from "./actions";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";
import { WhatsAppFeesCard } from "@/components/whatsapp-fees-card";
import { ModuleBookButton, ModuleCancelButton } from "@/components/bestand/module-book";
import { canSelfBookBestand } from "@/lib/bestand/self-service";
import { berlinTodayIso, bestandPacksText, freimonateKunde, normalizeRhythmus, PRICE_LIST, RHYTHMUS_MONATE, rhythmusFaktor, TERM_MONTHS, normalizeTerm } from "@/lib/offer-pricing";
import { currentPause, todayBerlin } from "@/lib/pause";
import { EmpfehlungBookButton, EmpfehlungCancelButton } from "@/components/empfehlung/client";
import { empfehlungVisible, moduleState, showNewBadge, trialAvailable } from "@/lib/empfehlung/shared";
import { includedPhrase } from "@/lib/seats";
import { contractCancelInfo } from "@/lib/vertrag-kuendigung";
import { helpCallSlots } from "@/lib/help-call";
import { VertragKuendigen } from "./vertrag-kuendigen";
import { AGB_ARCHIV_STAND, agbMitGarantien } from "@/lib/agb-2026-11-25";
import { Aufbewahrung } from "./aufbewahrung";
import { loadRetentionView } from "@/lib/ruhend";
import { loadHalteKonto } from "@/lib/halteangebote-server";
import { addMonthsIso, fmtIso, naechsteNachtraeglicheAbbuchung, naechsteRegulaereRechnung } from "@/lib/vertrag-laufzeit";
import { abrechnungsplan } from "@/lib/abrechnungstag";
import { bestandVisible } from "@/lib/bestand/sichtbar";
import { anbieterAnzeigeName } from "@/lib/erstinformation-shared";

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
      erstinformation: { select: { firma: true, name: true } },
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
      prepayFreeMonths: true,
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
    ? await prisma.offer.findUnique({ where: { id: customer.onboarding.offerId }, select: { term: true, softwareFee: true, number: true, token: true, status: true, package: true, createdAt: true, garantieStichtag: true, annualFreeMonths: true, paymentInArrears: true, startDate: true, introMonths: true, billingDay: true, acceptedAt: true, paidAt: true } })
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
  // Pay-per-Lead + Software: kein Werbebudget, keine Produkte, keine Pause (monatlich kündbar)
  // „Nur Leads“ (24.11.2026) wie Pay-per-Lead + Software: kein Werbebudget, keine Pause; dazu ohne Monatsgebühr
  const nurLeads = customer.plan === "ppl";
  const ppl = customer.plan === "ppl_software" || nurLeads;
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
  // Freimonate wie vereinbart (am Kunden eingefroren, Jahreszahlung vor dem 19.11.2026: 2, seitdem 3)
  const freimonate = freimonateKunde(customer, offer);
  const prepayFree = annual ? prepayMonths - rhythmusFaktor(rhythmus, freimonate) : 0;
  const yearly = annual && monthlyTotal != null ? monthlyTotal * rhythmusFaktor(rhythmus, freimonate) : null;
  // Zahlung nachträglich (Ole, 19.11.2026): nächste Abbuchung mit dem Leistungsmonat, für den sie gilt (nach einer
  // Kündigung höchstens noch die für den letzten Monat)
  const arrearsStart = !annual && offer?.paymentInArrears ? (customer.retainerStart ?? offer.startDate) : null;
  const naechsteNachtraeglich = arrearsStart
    ? naechsteNachtraeglicheAbbuchung(berlinTodayIso(arrearsStart), today, cancelInfo?.requested?.effectiveIso ?? null)
    : null;
  // Nächste reguläre Rechnung (Vorauszahlung oder monatlich im Voraus) nur, wenn der Betrag feststeht: Angebot mit Start,
  // keine Pause, kein Nachlass, keine Einführungsphase, kein Testkonto. Sonst nichts anzeigen.
  // Abo-Beginn wie bei Stripe (lib/billing createScheduleForOffer): Start, lag er beim Abschluss schon zurück, der Tag des Abschlusses
  const regAbschluss = offer?.paidAt ?? offer?.acceptedAt ?? null;
  const regStartRoh = offer?.startDate ? offer.startDate.toISOString().slice(0, 10) : null;
  const regStart = regStartRoh && regAbschluss ? [regStartRoh, berlinTodayIso(regAbschluss)].sort()[1] : null;
  const naechsteIso =
    !arrearsStart && regStart && monthlyTotal != null && !pause && !halte?.percentOff && !customer.isTest && !(offer?.introMonths && today < addMonthsIso(regStart, offer.introMonths))
      ? naechsteRegulaereRechnung({
          anchorIso: annual ? regStart : (abrechnungsplan({ startIso: regStart, billingDay: offer?.billingDay ?? null })?.firstIso ?? regStart),
          monate: annual ? prepayMonths : 1,
          ab: annual ? 1 : 0,
          todayIso: today,
          endIso: cancelInfo?.requested?.effectiveIso ?? null,
        })
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader back="/buyer/einstellungen" title="Konto & Rechnungen" subtitle={anbieterAnzeigeName(customer.erstinformation, customer.name)} />
      <FreePeriodNotices customerId={ctx.customerId} readOnly={ctx.preview} />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Ihr Vertrag" icon={Package} />
          {/* UX-Runde 19.11.2026: zuerst die eine Antwort „Was zahle ich?“ (Betrag, Rhythmus, Weg), darunter die Einzelheiten */}
          {monthlyTotal != null ? (
            <div className="border-b border-[color:var(--border)] px-5 py-4" data-konto-summe>
              <div className="text-sm text-[color:var(--muted)]">Sie zahlen</div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[28px] font-bold leading-tight tracking-tight tabular-nums">{eur(annual && yearly != null ? yearly : monthlyTotal)}</span>
                <span className="text-[15px] text-[color:var(--muted)]">netto {annual ? (prepayMonths === 6 ? "für 6 Monate" : "im Jahr") : "im Monat"}</span>
              </div>
              <div className="mt-1 text-[15px]" data-konto-interval>
                {annual
                  ? `Im Voraus, ${prepayFree} ${prepayFree === 1 ? "Monat" : "Monate"} geschenkt`
                  : arrearsStart
                    ? "Monatlich, jeweils nachträglich für den abgelaufenen Monat"
                    : "Monatlich"}
                {customer.stripeCustomerId ? "" : ", per Rechnung"}, zzgl. USt.
              </div>
              {/* Nächste Rechnung (Ole, 19.11.2026): nur, wenn die App Datum und Betrag sicher kennt (lib/vertrag-laufzeit) */}
              {naechsteNachtraeglich ? (
                <div className="mt-1 text-[15px] text-[color:var(--muted)]" data-konto-nachtraeglich>
                  Nächste Abbuchung am {fmtIso(naechsteNachtraeglich.chargeIso)}: {eur(monthlyTotal)} netto für {fmtIso(naechsteNachtraeglich.fromIso)} bis{" "}
                  {fmtIso(naechsteNachtraeglich.toIso)}
                </div>
              ) : naechsteIso ? (
                <div className="mt-1 text-[15px] text-[color:var(--muted)]" data-konto-naechste-rechnung>
                  Nächste Rechnung am {fmtIso(naechsteIso)}: {eur(annual && yearly != null ? yearly : monthlyTotal)} netto
                </div>
              ) : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 p-5 text-[15px] sm:grid-cols-[150px_1fr]">
            <dt className="text-[color:var(--muted)]">Paket</dt>
            <dd>{service ? "Leadgenerierung (Betreuung)" : nurLeads ? "Nur Leads (per Stück, ohne Monatsgebühr)" : ppl ? "Pay-per-Lead + Software (Leads separat pro Stück)" : "Leadgenerierung + Software"}</dd>
            {monthly != null && (seatsFee || bestandFee || empfehlungFee) ? (
              <>
                <dt className="text-[color:var(--muted)]">Paket monatlich</dt>
                <dd>{eur(monthly)} netto</dd>
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
            {annual && monthlyTotal != null ? (
              <>
                <dt className="text-[color:var(--muted)]">Monatspreis</dt>
                <dd>{eur(monthlyTotal)} netto</dd>
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
                  {nurLeads
                    ? "Keine, Leads nur bei Bestellung"
                    : annual
                    ? `${prepayMonths} Monate, verlängert sich um ${prepayMonths} Monate, wenn nicht 1 Monat vor Ende gekündigt`
                    : TERM_MONTHS[normalizeTerm(offer.term)] > 0
                      ? `${TERM_MONTHS[normalizeTerm(offer.term)]} Monate, danach monatlich kündbar`
                      : "Monatlich kündbar"}
                </dd>
                {ppl ? null : (
                  <>
                    <dt className="text-[color:var(--muted)]">Pause / Urlaub</dt>
                    <dd>
                      Jederzeit selbst unter{" "}
                      <Link href="/buyer/wachstum#pause" className="font-medium text-[color:var(--brand)] underline">
                        Wachstum → Pause
                      </Link>
                    </dd>
                  </>
                )}
                <dt className="text-[color:var(--muted)]">Vertrag</dt>
                <dd>
                  <a href={`/angebot/${offer.token}`} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
                    Angebot {offer.number} ansehen
                  </a>
                </dd>
                {/* AGB des Vertrags (Ole, 26.11.2026): nur die geltenden Abschnitte; Verträge aus Angeboten vor
                    GUARANTEES_UNTIL mit der archivierten Fassung mit Garantien */}
                {offer.status === "accepted" ? (
                  <>
                    <dt className="text-[color:var(--muted)]">AGB</dt>
                    <dd>
                      <a
                        href={`/angebot/${offer.token}/agb`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[color:var(--brand)] underline"
                        data-konto-agb
                        {...(agbMitGarantien(offer) ? { "data-konto-agb-archiv": "" } : {})}
                      >
                        {agbMitGarantien(offer) ? `Ihre AGB (Stand ${AGB_ARCHIV_STAND})` : "Ihre AGB"}
                      </a>
                    </dd>
                  </>
                ) : null}
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
                canPause={!pause && !ppl}
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
        {ppl ? null : (
        <Link href="/buyer/wachstum#budget" className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-3 text-[15px] hover:border-[color:var(--brand)]" data-konto-wachstum>
          <span>Werbebudget, Produkte und Pause</span>
          <span className="text-sm font-medium text-[color:var(--brand)]">Unter Wachstum</span>
        </Link>
        )}

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
                    freeMonths={annual ? prepayFree : PRICE_LIST.annualFreeMonths}
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
                    {/* Inklusive steht schon oben im Vertrag (UX-Runde 19.11.2026) */}
                    Aktiv ist, wer Leads bekommt. Mitglieder ohne Leads (z. B. Assistenz) sind kostenlos. Weitere Verkäufer legen Sie selbst im Team an,
                    tagesgenau berechnet.
                  </p>
                  <Link href="/buyer/team" className={buttonClass("secondary", "sm")}>
                    Zum Team
                  </Link>
                </li>
              ) : null}
            </ul>
          </Card>
        ) : null}

        {/* UX-Runde 19.11.2026: Rechnungen und Zahlung in einer Karte (vorher zwei), Rechnungen zuerst. „Neue Leads per E-Mail“
            steht jetzt unter Einstellungen → Erinnerungen & Aufgaben, das Konto zeigt nur Vertrag und Geld. */}
        <Card>
          <CardHeader title="Rechnungen und Zahlung" icon={FileText} count={invoices.length || undefined} />
          {zahlung === "ok" ? (
            <p className="mx-5 mt-4 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Danke, Ihre Zahlungsart ist hinterlegt und gilt ab der nächsten Rechnung.
            </p>
          ) : null}
          {portal && PORTAL_MSG[portal] ? <p className="mx-5 mt-4 text-sm font-medium text-rose-700">{PORTAL_MSG[portal]}</p> : null}
          {invoices.length > 0 ? (
            <ul className="divide-y divide-[color:var(--border)]" data-konto-rechnungen>
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
          ) : customer.stripeCustomerId ? (
            <p className="px-5 pt-4 text-sm text-[color:var(--muted)]">Noch keine Rechnungen. Sie erscheinen hier, sobald die erste erstellt ist.</p>
          ) : null}
          <div className={`p-5 ${invoices.length > 0 ? "border-t border-[color:var(--border)]" : ""}`}>
            {billingEnabled() && customer.stripeCustomerId ? (
              <form action={paymentSetupAction} className="max-w-md space-y-4" data-konto-zahlart>
                <ZahlartAuswahl />
                <button type="submit" disabled={ctx.preview} className={buttonClass("primary", "md")}>
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
              <p className="text-[15px]" data-konto-ohne-online-zahlung>
                Ihre Rechnungen kommen per E-Mail, Sie zahlen per Überweisung.{" "}
                <span className="text-[color:var(--muted)]">Neue Rechnungsadresse oder USt-IdNr.? Schreiben Sie uns über „Hilfe“.</span>
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Ihre Daten herunterladen" icon={Download} />
          <div className="space-y-3 p-5 text-sm" data-konto-export>
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
