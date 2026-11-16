import { redirect } from "next/navigation";
import { EmpfehlungGrowthRow } from "@/components/empfehlung/server";
import { ChevronDown } from "lucide-react";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { WerbungKarten } from "@/app/buyer/konto/werbung-karten";
import { loadBestandVisible } from "@/lib/bestand/sichtbar-server";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { FunnelHero } from "@/components/funnel-hero";
import { KpiCard, type Delta } from "@/components/kpi-card";
import { LiveUpdated } from "@/components/live-updated";
import { MonthlyForecast } from "@/components/monthly-forecast";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams, previousRange } from "@/lib/date-ranges";
import { computeCustomerSpend, loadRetainerConfig } from "@/lib/customer-spend";
import { computeMonthlyForecast } from "@/lib/forecast";
import { computeKpis, type Kpis } from "@/lib/kpis";
import {
  formatDate,
  formatEUR,
  formatNumber,
} from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { TeamStats } from "@/components/team-stats";
import { MonatsberichteKunde } from "@/components/monatsberichte-kunde";
// Karte „Deine Garantie“ (components/garantie-kunde-card.tsx) ist seit 12.11.2026 ausgeblendet (Ole):
// Kunden sehen den Garantie-Stand nicht mehr, die Prüfung läuft nur im Admin. Wieder einbauen mit
//   import { GarantieKundeCard } from "@/components/garantie-kunde-card";  und  <GarantieKundeCard customerId={session.customerId} />
import { nowMs } from "@/lib/now";
import { bestandOf, contractsPerCustomer, ertragForRange, loadErtragData } from "@/lib/ertrag";
import { loadGewinnMitBestand } from "@/lib/gewinn-modus";
import { GewinnModusSwitch } from "@/components/gewinn-modus";
import { STORNO_MIN_VERTRAEGE } from "@/lib/provision";
import { originWhere } from "@/lib/lead-herkunft";
import { earlyHint, pickTips } from "@/lib/zahlen-tipps";
import { loadTipSignals, monthsSinceStart } from "@/lib/zahlen-tipps-server";
import { ZahlenTippsCard } from "@/components/zahlen-tipps-card";
import { BestandGrowthSection } from "@/components/bestand-growth-chart";
import { NextStepKpi } from "@/components/next-step-kpi";
import { nochOhneLeads, ZahlenNochLeer } from "@/components/zahlen-noch-leer";
import { KeinWhatsAppKpi } from "@/components/kein-whatsapp-kpi";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wachstum | performancegrowth",
};

export default async function BuyerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getBuyerContext();
  if (!session) {
    redirect("/login");
  }
  // Berater: Zahlen (Kosten, Gewinn) sieht nur der Inhaber.
  if (session.teamRole === "advisor") redirect("/buyer/leads");

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = nowMs();


  // Vor dem ersten Lead: Hinweis statt Nullen (Ole, 15.11.2026)
  if (await nochOhneLeads(session.customerId)) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader title="Wachstum" />
        <ZahlenNochLeer customerId={session.customerId} now={renderedAt} />
        <div className="mt-6 space-y-6">
          <WerbungKarten customerId={session.customerId} readOnly={session.preview} />
        </div>
      </main>
    );
  }

  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Wachstum"
          subtitle={
            <>
              {formatDate(range.from)} bis {formatDate(range.to)} · aktualisiert <LiveUpdated since={renderedAt} />
            </>
          }
          actions={
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
          }
        />

        {/* Eine Seite für Zahlen, Werbebudget, Produkte und Pause (UX, Ole 15.11.2026): Sprungmarken statt Zwischenseite */}
        <nav className="-mt-2 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Auf dieser Seite">
          <a href="#budget" className="font-medium text-[color:var(--brand)] hover:underline">Werbebudget</a>
          <a href="#produkte" className="font-medium text-[color:var(--brand)] hover:underline">Produkte</a>
          <a href="#pause" className="font-medium text-[color:var(--brand)] hover:underline">Pause</a>
          <a href="#monatsberichte" className="font-medium text-[color:var(--brand)] hover:underline" data-sprung-monatsberichte>Monatsberichte</a>
          {(await loadBestandVisible(session.customerId, { preview: session.preview })) ? (
            <a href="/buyer/bestand" className="font-medium text-[color:var(--brand)] hover:underline">Bestandskunden</a>
          ) : null}
          {(await prisma.leadSubscription.count({ where: { customerId: session.customerId, active: true, delivery: "app" } })) > 0 ? (
            <a href="/buyer/bestellen" className="font-medium text-[color:var(--brand)] hover:underline">Leads bestellen</a>
          ) : null}
        </nav>

        <EmpfehlungGrowthRow ctx={{ customerId: session.customerId, teamRole: session.teamRole }} />

        <Suspense
          fallback={
            <div className="text-sm text-[color:var(--muted)]">
              Lade Dashboard…
            </div>
          }
        >
          <BuyerDashboardBody
            customerId={session.customerId}
            range={range}
          />
          <TeamStats customerId={session.customerId} range={range} mitBestand={await loadGewinnMitBestand(session)} />
          <div className="mt-6">
            <MonatsberichteKunde customerId={session.customerId} />
          </div>
        </Suspense>
        <section className="mt-8 space-y-6" aria-label="Werbung und Produkte">
          <h2 className="text-lg font-semibold tracking-tight">Werbung und Produkte</h2>
          <WerbungKarten customerId={session.customerId} readOnly={session.preview} />
        </section>
      </main>
    </PullToRefresh>
  );
}

function delta(
  current: number | null,
  previous: number | null,
  lowerIsBetter = false,
): Delta {
  if (current == null || previous == null) return { pct: null, lowerIsBetter };
  if (previous === 0) {
    if (current === 0) return { pct: 0, lowerIsBetter };
    return { pct: null, lowerIsBetter };
  }
  return { pct: (current - previous) / Math.abs(previous), lowerIsBetter };
}

async function BuyerDashboardBody({
  customerId,
  range,
}: {
  customerId: string;
  range: { from: Date; to: Date };
}) {
  const prev = previousRange(range);
  const now = new Date();
  // BuyerComparison/Leaderboard ist aktuell ausgeblendet — die Berechnung
  // (computeCustomerLeaderboard) sparen wir uns hier, bis der Vergleich
  // wieder eingeblendet wird.
  // Trichter, Quoten und Kosten pro Lead/Termin/Abschluss nur aus bezahlten Leads (lib/lead-herkunft);
  // Provision und Gewinn zählen alle Herkünfte (Empfehlungen, Bestandskampagnen). Rechnung: lib/ertrag.
  const retainerCfg = await loadRetainerConfig(customerId);
  const [k, p, forecast, spend, spendPrev, data, extraClosed, mitBestand] = await Promise.all([
    computeKpis({ range, customerId, product: null, origin: "paid" }) as Promise<Kpis>,
    computeKpis({ range: prev, customerId, product: null, origin: "paid" }) as Promise<Kpis>,
    computeMonthlyForecast({ customerId, includeCloseValue: true }),
    retainerCfg ? computeCustomerSpend(customerId, range, retainerCfg) : null,
    retainerCfg ? computeCustomerSpend(customerId, prev, retainerCfg) : null,
    loadErtragData(customerId),
    Promise.all(
      (["empfehlung", "bestand"] as const).map((o) =>
        prisma.lead.count({ where: { customerId, createdAt: { gte: range.from, lte: range.to }, closedAt: { not: null }, ...originWhere(o) } }),
      ),
    ),
    // Gewinn-Schalter „Nur jetzt“ / „Inkl. Bestand“ (je Login gespeichert)
    getBuyerContext().then((c) => loadGewinnMitBestand(c)),
  ]);

  // Lead-Kosten aus Kundensicht: Pro-Lead-Kunden = Lead-Preis (Revenue),
  // Retainer-Kunden = eigenes Werbebudget + Retainer.
  const cost = spend ? spend.total : Number(k.revenue);
  const costPrev = spendPrev ? spendPrev.total : Number(p.revenue);
  const costHint = spend
    ? `Werbebudget ${formatEUR(spend.adSpend)} + Retainer ${formatEUR(spend.retainer)}`
    : "Brutto im Zeitraum";

  const [cur, before] = await Promise.all([
    ertragForRange(customerId, data, range, now, cost),
    ertragForRange(customerId, data, prev, now, costPrev),
  ]);
  // Bestand mit der Stornoquote des Kunden (Meine Provisionen), gekündigte Verträge ab dem Datum raus
  const bestand = bestandOf(data, now);
  const makler = data.typ === "makler";
  const prov = cur.provision;
  const perCustomer = contractsPerCustomer(data.contracts);
  const a = cur.agency;

  // Tipps, wenn der Gewinn im Zeitraum oder in der Hochrechnung negativ ist (Seite nur für Inhaber)
  const negative = cur.gewinn < 0 || (forecast.buyer?.gewinnProjected ?? 0) < 0;
  const [tipSignals, months, dismissed] = negative
    ? await Promise.all([
        loadTipSignals(customerId, data, now).catch(() => null),
        monthsSinceStart(customerId, now),
        prisma.customer.findUnique({ where: { id: customerId }, select: { zahlenTipsDismissed: true } }).then((c) => c?.zahlenTipsDismissed ?? null),
      ])
    : [null, null, null];
  const tips = tipSignals ? pickTips(tipSignals, dismissed, now) : [];
  const ctx = await getBuyerContext();

  const [empfClosed, bestandClosed] = extraClosed;
  const extras = [
    empfClosed > 0 ? `+ ${formatNumber(empfClosed)} ${empfClosed === 1 ? "Abschluss" : "Abschlüsse"} aus Empfehlungen` : null,
    // Bestandskampagnen: Abschlüsse je Vertrag (60 Tage nach dem Anschreiben, letzte Kampagne zählt), wie in „Kosten & Ertrag“
    prov.byOrigin.bestand.contracts > 0 ? `+ ${formatNumber(prov.byOrigin.bestand.contracts)} aus Bestandskampagnen` : bestandClosed > 0 ? `+ ${formatNumber(bestandClosed)} aus Bestandskampagnen` : null,
  ].filter(Boolean);
  const breakdown: [string, number][] = [
    [makler ? "Courtage 1. Jahr" : "Abschlussprovision", prov.firstYear + prov.chargeback],
    ["Lead-Kosten", -cur.leadCosts],
    [a.baseInLeadCosts ? "USt. auf den Retainer" : "Betreuung & Software", -a.betreuung],
  ];
  if (a.logins > 0) breakdown.push(["Weitere Logins", -a.logins]);
  if (a.module > 0) breakdown.push(["Zusatzmodule", -a.module]);
  if (a.whatsapp > 0) breakdown.push(["WhatsApp-Gebühren", -a.whatsapp]);
  if (a.setup > 0) breakdown.push(["Einrichtung (verteilt)", -a.setup]);
  if (a.gutschrift > 0) breakdown.push(["Gutschrift Empfehlung", a.gutschrift]);
  // Rückbelastungen gekündigter Verträge mindern die Provision im Monat der Kündigung (eigene Zeile)
  if (prov.chargeback > 0) breakdown.splice(1, 0, ["Rückbelastung (gekündigte Verträge)", -prov.chargeback]);
  // „Inkl. Bestand“: künftige Bestandsprovision der Verträge dieses Zeitraums (Kohorte, 5 Jahre, Prognose)
  if (mitBestand) breakdown.push([`künftige ${makler ? "Bestandscourtage" : "Bestandsprovision"} (5 Jahre, Prognose)`, prov.futureTrail]);
  const gewinnShown = mitBestand ? cur.gewinnMitBestand : cur.gewinn;
  const gewinnBefore = mitBestand ? before.gewinnMitBestand : before.gewinn;
  const gewinnLabel = mitBestand ? "ergibt Gewinn mit künftigem Bestand" : "ergibt Gewinn";
  const breakdownTitle = [...breakdown.map(([l, v]) => `${l}: ${formatEUR(v)}`), `${gewinnLabel}: ${formatEUR(gewinnShown)}`].join("\n");
  const stornoPct = `${(Math.round(bestand.storno * 1000) / 10).toLocaleString("de-DE")} %`;
  const provSub = [
    prov.crossSell.contracts > 0
      ? `davon Cross-Selling: ${formatNumber(prov.crossSell.contracts)} ${prov.crossSell.contracts === 1 ? "Vertrag" : "Verträge"}, ${formatEUR(prov.crossSell.amount)}`
      : null,
    prov.byOrigin.empfehlung.amount > 0 ? `davon aus Empfehlungen: ${formatEUR(prov.byOrigin.empfehlung.amount)}` : null,
    prov.byOrigin.bestand.contracts > 0
      ? `aus Bestandskampagnen: ${formatNumber(prov.byOrigin.bestand.contracts)} ${prov.byOrigin.bestand.contracts === 1 ? "Abschluss" : "Abschlüsse"}, ${formatEUR(prov.byOrigin.bestand.amount)}`
      : null,
    perCustomer != null && perCustomer > 1 ? `Verträge pro Kunde: ${perCustomer.toLocaleString("de-DE")}` : null,
    prov.honorar > 0 ? `davon Honorar (vom Kunden): ${formatEUR(prov.honorar)}` : null,
    prov.chargeback > 0 ? `abzüglich Rückbelastung: ${formatEUR(prov.chargeback)}` : null,
  ].filter((x): x is string => !!x);
  const perClose = k.closedLeads > 0 ? cur.costs / k.closedLeads : null;

  return (
    <div className="mt-6 space-y-6">
      <FunnelHero
        kpis={k}
        kopfzahlen={false}
        footer={
          <>
            Nur bezahlte Leads, damit die Quoten stimmen.
            {extras.length ? <span className="ml-1 font-medium text-[color:var(--foreground)]">{extras.join(" · ")}</span> : null}
          </>
        }
      />

      <NextStepKpi customerId={customerId} />

      <KeinWhatsAppKpi customerId={customerId} range={range} />

      <section>
        <h2 className="mb-3 text-[15px] font-semibold tracking-tight">Kosten &amp; Ertrag</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Lead-Kosten"
            value={formatEUR(cost)}
            tone="neutral"
            hint={k.nettoLeads > 0 ? `${formatEUR(cost / k.nettoLeads)} pro Lead` : costHint}
            delta={delta(cost, costPrev, true)}
          />
          <KpiCard
            label={makler ? "Courtage 1. Jahr (geschätzt)" : "Abschlussprovision (geschätzt)"}
            value={formatEUR(prov.firstYear)}
            tone="positive"
            hint={
              <>
                aus {formatNumber(prov.leads)} {prov.leads === 1 ? "Abschluss" : "Abschlüssen"}, {makler ? "im 1. Jahr" : "einmalig"}
                {provSub.map((t) => (
                  <span key={t} className="block">
                    {t}
                  </span>
                ))}
              </>
            }
            delta={delta(prov.firstYear, before.provision.firstYear)}
          />
          <KpiCard
            label={makler ? "Bestandscourtage" : "Bestandsprovision"}
            value={`+ ${formatEUR(bestand.perYear)} pro Jahr`}
            tone={bestand.perYear > 0 ? "positive" : "neutral"}
            hint={
              <>
                aus {formatNumber(bestand.contracts)} {bestand.contracts === 1 ? "Vertrag" : "Verträgen"}, {bestand.fromYear2 ? "ab dem 2. Jahr" : "ab sofort"}
                <span className="block font-medium text-[color:var(--foreground)]">in 5 Jahren: {formatEUR(bestand.inYears)}</span>
                {prov.trailPerYear > 0 ? <span className="block">+ {formatEUR(prov.trailPerYear)} pro Jahr aus diesem Zeitraum</span> : null}
                <span className="block" data-storno-real>
                  {bestand.real.quote != null
                    ? `Tatsächliche Stornoquote: ${(Math.round(bestand.real.quote * 1000) / 10).toLocaleString("de-DE")} % pro Jahr`
                    : `Tatsächliche Stornoquote: zu wenig Daten (ab ${STORNO_MIN_VERTRAEGE} Verträgen)`}
                </span>
                <Info>
                  {makler ? "Bestandscourtage" : "Bestandsprovision"} aus allen laufenden Verträgen seit Start, mit Ihren Sätzen aus Meine Provisionen
                  {bestand.fromYear2 ? " (als Vertreter bei Sach ab dem 2. Vertragsjahr)" : ""}. Gerechnet mit dem eingetragenen Beitrag, ohne Angabe
                  mit dem Standardbeitrag der Sparte. Gekündigte bzw. stornierte Verträge zählen ab dem Kündigungsdatum nicht mehr. Für „in 5 Jahren“
                  nehmen wir an, dass jedes Jahr {stornoPct} der Verträge wegfallen ({bestand.stornoCustom ? "Ihre Stornoquote" : "Standard"},{" "}
                  <a href="/buyer/provisionen#storno" className="font-medium text-[color:var(--brand)] underline">
                    ändern
                  </a>
                  ). Neue Abschlüsse sind nicht eingerechnet. Hochgeladene Bestandsverträge (Kundenliste) zählen nicht dazu, nur Abschlüsse in der App.
                </Info>
              </>
            }
          />
          <div title={breakdownTitle} data-gewinn-karte data-gewinn-modus={mitBestand ? "bestand" : "jetzt"}>
            <KpiCard
              label={
                <>
                  Gewinn
                  {mitBestand ? (
                    <span className="ml-1.5 rounded-full bg-[color:var(--brand-soft,#eff6ff)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--brand)]">mit künftigem Bestand</span>
                  ) : null}
                </>
              }
              extra={<GewinnModusSwitch mitBestand={mitBestand} />}
              value={formatEUR(gewinnShown)}
              tone={gewinnShown >= 0 ? "positive" : "negative"}
              hint={
                <>
                  Provision minus Lead-Kosten und Betreuung
                  {mitBestand ? (
                    <span className="block font-medium text-[color:var(--foreground)]" data-kuenftiger-bestand>
                      davon künftige {makler ? "Bestandscourtage" : "Bestandsprovision"}: {formatEUR(prov.futureTrail)} (5 Jahre)
                    </span>
                  ) : prov.futureTrail > 0 ? (
                    <span className="block">mit künftigem Bestand: {formatEUR(cur.gewinnMitBestand)}</span>
                  ) : null}
                  <Info label="Aufschlüsselung">
                    <span className="block space-y-0.5">
                      {breakdown.map(([l, v]) => (
                        <span key={l} className="flex justify-between gap-3 tabular-nums">
                          <span>{l}</span>
                          <span>{formatEUR(v)}</span>
                        </span>
                      ))}
                      <span className="flex justify-between gap-3 border-t border-[color:var(--border)] pt-0.5 font-semibold tabular-nums">
                        <span>{gewinnLabel}</span>
                        <span>{formatEUR(gewinnShown)}</span>
                      </span>
                    </span>
                    <span className="mt-1 block">
                      Betreuung &amp; Software inklusive USt., weil Versicherungsvermittler meist keine Vorsteuer ziehen. Die Einrichtung verteilen
                      wir über die Mindestlaufzeit.{a.baseInLeadCosts ? " Der Retainer steckt schon in den Lead-Kosten." : ""}
                    </span>
                  </Info>
                  <Info>
                    „Inkl. Bestand“ (Standard) rechnet zu dem, was im Zeitraum verdient ist, die künftige{" "}
                    {makler ? "Bestandscourtage" : "Bestandsprovision"} der Verträge dazu, die in diesem Zeitraum abgeschlossen wurden, über ihre ersten
                    5 Jahre ({makler ? "das 1. Jahr steckt schon in der Courtage" : "als Vertreter bei Sach ab dem 2. Jahr"}). Das ist eine Prognose: mit
                    Ihrer Stornoquote von {stornoPct} pro Jahr (
                    <a href="/buyer/provisionen#storno" className="font-medium text-[color:var(--brand)] underline">
                      ändern
                    </a>
                    ), ohne Abzinsung, gekündigte Verträge nur bis zum Kündigungsdatum. Ihr bisheriger Bestand zählt hier nicht mit: Hochgeladene Bestandsverträge zählen nicht zum Gewinn, nur neue Abschlüsse, auch aus Bestandskampagnen. „Nur jetzt“ zählt nur, was im Zeitraum verdient ist.
                  </Info>
                </>
              }
              delta={delta(gewinnShown, gewinnBefore)}
            />
          </div>
          <KpiCard
            label="Kosten pro Abschluss"
            value={formatEUR(perClose)}
            hint={k.terminLeads > 0 ? `${formatEUR(cur.costs / k.terminLeads)} pro Termin · alle Kosten` : "Lead-Kosten plus Betreuung"}
            delta={delta(perClose, p.closedLeads > 0 ? before.costs / p.closedLeads : null, true)}
          />
        </div>
      </section>

      {tips.length ? (
        <ZahlenTippsCard
          tips={tips.map(({ key, title, text, href, cta }) => ({ key, title, text, href, cta }))}
          intro={
            cur.gewinn < 0
              ? (earlyHint(months, bestand.inYears) ?? "Ihre Zahlen sind gerade im Minus. Diese Schritte bringen am meisten:")
              : "Für diesen Monat zeichnet sich ein Minus ab. Diese Schritte bringen am meisten:"
          }
          canDismiss={!!ctx && !ctx.preview}
        />
      ) : null}

      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center justify-between px-5 py-3.5 text-[15px] font-semibold">
          Hochrechnung für diesen Monat
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-[color:var(--border)] p-2 sm:p-3">
          <MonthlyForecast forecast={forecast} />
        </div>
      </details>

      {bestand.growth.some((g) => g.total > 0) ? (
        <BestandGrowthSection
          points={bestand.growth}
          intro={`${makler ? "Bestandscourtage" : "Bestandsprovision"} pro Jahr, wenn Sie im aktuellen Tempo weitermachen: ${bestand.perMonth.toLocaleString("de-DE")} ${bestand.perMonth === 1 ? "Vertrag" : "Verträge"} pro Monat wie in den letzten 3 Monaten, ${Math.round(bestand.storno * 100)} % Storno pro Jahr.`}
        />
      ) : null}

      {/* BuyerComparison/Leaderboard temporär ausgeblendet —
          wird wieder eingebaut, sobald der Vergleich freigegeben ist. */}
    </div>
  );
}

/** Kurzer Infotext zum Antippen (in Karten). */
function Info({ label = "So rechnen wir", children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="mt-1 [&>summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer list-none font-medium text-[color:var(--brand)]">{label}</summary>
      <span className="mt-1 block text-[11px] leading-snug text-[color:var(--muted)]">{children}</span>
    </details>
  );
}
