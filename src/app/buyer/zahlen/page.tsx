import { redirect } from "next/navigation";
import { mitKampagnen } from "@/lib/offer-pricing";
import { InfoHinweis } from "@/components/info-hinweis";
import { bestandErklaert } from "@/lib/begriffe";
import { EmpfehlungGrowthRow } from "@/components/empfehlung/server";
import { ChevronDown } from "lucide-react";
import { Suspense } from "react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { WerbungKarten } from "@/app/buyer/konto/werbung-karten";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams, previousRange } from "@/lib/date-ranges";
import { computeCustomerSpend, loadRetainerConfig } from "@/lib/customer-spend";
import { computeMonthlyForecast } from "@/lib/forecast";
import { computeKpis, type Kpis } from "@/lib/kpis";
import { formatDate, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { TeamStats } from "@/components/team-stats";
import { MonatsberichteKunde } from "@/components/monatsberichte-kunde";
// Karte „Deine Garantie“ (components/garantie-kunde-card.tsx) ist seit 12.11.2026 ausgeblendet (Ole):
// Kunden sehen den Garantie-Stand nicht mehr, die Prüfung läuft nur im Admin. Wieder einbauen mit
//   import { GarantieKundeCard } from "@/components/garantie-kunde-card";  und  <GarantieKundeCard customerId={session.customerId} />
import { nowMs } from "@/lib/now";
import { bestandOf, contractsPerCustomer, ertragForRange, loadErtragData, provisionAusText, summarizeProvision } from "@/lib/ertrag";
import { loadGewinnMitBestand } from "@/lib/gewinn-modus";
import { originWhere } from "@/lib/lead-herkunft";
import { pickTips } from "@/lib/zahlen-tipps";
import { loadTipSignals } from "@/lib/zahlen-tipps-server";
import { BestandGrowthSection } from "@/components/bestand-growth-chart";
import { nochOhneLeads, ZahlenNochLeer } from "@/components/zahlen-noch-leer";
import { VerlustKarte } from "@/components/verlust-karte";
import { verlustKarte } from "@/lib/verlustgruende-server";
import { LOST_STATUSES } from "@/lib/lead-lost";
import { CLOSED_STATUS, displayProduct } from "@/lib/products";
import { loadOffeneChancen } from "@/lib/offene-chancen-server";
import { ladeWerbeAnteil } from "@/lib/werbebudget-produkt";
import { chancenAufteilung } from "@/lib/offene-chancen";
import { antwort, euro, euroCent, euroMitVorzeichen, rechnetSich } from "@/lib/wachstum";
import { RechnetSich, type RechnungZeile } from "@/components/wachstum/rechnet-sich";
import { Kennzahl } from "@/components/wachstum/kennzahl";
import { ChancenKachel } from "@/components/wachstum/chancen-kachel";
import { Trichter } from "@/components/wachstum/trichter";
import { HebelKarte } from "@/components/wachstum/hebel";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  /** Filter der Karte „Warum Leads verloren gehen“: Produkt und Berater */
  vgp?: string;
  vgb?: string;
  /** Produktfilter der ganzen Seite (Ole, 24.11.2026), Wert = Lead.source */
  produkt?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wachstum | performancegrowth",
};

const SPRUNG = "-my-1.5 py-2 text-[color:var(--muted)] hover:text-[color:var(--foreground)] hover:underline";

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
  // Bestandskunden-Modul: Link, Kampagnen-Zahlen und Hinweise nur, wenn es freigeschaltet ist (Ole, 17.11.2026)
  const kundeInfo = await prisma.customer.findUnique({ where: { id: session.customerId }, select: { existingCustomersEnabled: true, plan: true } });
  const bestandAn = !!kundeInfo?.existingCustomersEnabled;
  // Pay-per-Lead + Software (Ole, 19.11.2026): kein Werbebudget, keine Produkte, keine Pause; Leads per Stück bestellen
  const kampagnen = mitKampagnen(kundeInfo?.plan);
  const bestellbar = (await prisma.leadSubscription.count({ where: { customerId: session.customerId, active: true, delivery: { in: ["app", "app_pdf"] } } })) > 0;
  // Produktfilter (Ole, 24.11.2026): Produkte aus den Leads des Kunden; Auswahl nur, wenn es mehr als eins gibt
  const quellen = await prisma.lead.groupBy({ by: ["source"], where: { customerId: session.customerId, isTest: false, erasedAt: null, source: { not: null } }, _count: { _all: true }, orderBy: { _count: { source: "desc" } } });
  const produkte = quellen.filter((q): q is typeof q & { source: string } => !!q.source).map((q) => ({ value: q.source, label: displayProduct(q.source) }));
  const produkt = produkte.length > 1 && sp.produkt && produkte.some((x) => x.value === sp.produkt) ? sp.produkt : null;

  // Vor dem ersten Lead: Hinweis statt Nullen (Ole, 15.11.2026)
  if (await nochOhneLeads(session.customerId)) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader title="Wachstum" />
        <ZahlenNochLeer customerId={session.customerId} now={renderedAt} />
        <div className="mt-6 space-y-6">
          {kampagnen ? <WerbungKarten customerId={session.customerId} readOnly={session.preview} /> : <LeadsBestellenKarte bestellbar={bestellbar} />}
        </div>
      </main>
    );
  }

  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 text-[15px] sm:px-6 lg:px-8">
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
              produkte={produkte}
              currentProdukt={produkt}
            />
          }
        />

        {/* Eine Seite für Zahlen, Werbebudget, Produkte und Pause (UX, Ole 15.11.2026): Sprungmarken, seit 18.11.2026 dezent */}
        <nav className="-mt-2 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Auf dieser Seite">
          {kampagnen ? (
            <>
              <a href="#budget" className={SPRUNG}>Werbebudget</a>
              <a href="#produkte" className={SPRUNG}>Produkte</a>
              <a href="#pause" className={SPRUNG}>Pause</a>
            </>
          ) : null}
          <a href="#monatsberichte" className={SPRUNG} data-sprung-monatsberichte>Monatsberichte</a>
          {bestandAn ? (
            <a href="/buyer/bestand" className={SPRUNG}>Bestand</a>
          ) : null}
          {bestellbar ? (
            <a href="/buyer/bestellen" className={SPRUNG}>Leads bestellen</a>
          ) : null}
        </nav>

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
            params={sp}
            produkt={produkt}
            produktLabel={produkte.find((x) => x.value === produkt)?.label ?? null}
            bestandAn={bestandAn}
            canDismiss={!session.preview && session.teamRole === "owner"}
          />
          <div className="mt-6">
            <TeamStats customerId={session.customerId} range={range} mitBestand={await loadGewinnMitBestand(session)} />
          </div>
          <div className="mt-6">
            <EmpfehlungGrowthRow ctx={{ customerId: session.customerId, teamRole: session.teamRole }} />
          </div>
          <div className="mt-6">
            <MonatsberichteKunde customerId={session.customerId} />
          </div>
        </Suspense>
        {kampagnen ? (
          <section className="mt-8 space-y-6" aria-label="Werbung und Produkte">
            <h2 className="text-lg font-semibold tracking-tight">Werbung und Produkte</h2>
            <WerbungKarten customerId={session.customerId} readOnly={session.preview} />
          </section>
        ) : (
          <section className="mt-8" aria-label="Leads bestellen">
            <LeadsBestellenKarte bestellbar={bestellbar} />
          </section>
        )}
      </main>
    </PullToRefresh>
  );
}

async function BuyerDashboardBody({
  customerId,
  range,
  params,
  produkt,
  produktLabel,
  bestandAn,
  canDismiss,
}: {
  customerId: string;
  range: { from: Date; to: Date };
  params: Record<string, string | undefined>;
  /** Produktfilter (Lead.source) bzw. null = alle Produkte */
  produkt: string | null;
  produktLabel: string | null;
  /** Bestandskunden-Modul freigeschaltet: sonst keine Bestandskampagnen und keine Kundenliste erwähnen. */
  bestandAn: boolean;
  /** Hebel ausblenden: nur Inhaber, nicht in der Admin-Vorschau. */
  canDismiss: boolean;
}) {
  const prev = previousRange(range);
  const now = new Date();
  // Trichter, Quoten und Kosten pro Lead/Termin/Abschluss nur aus bezahlten Leads (lib/lead-herkunft);
  // Provision und Gewinn zählen alle Herkünfte (Empfehlungen, Bestandskampagnen). Rechnung: lib/ertrag.
  const retainerCfg = await loadRetainerConfig(customerId);
  const [k, p, forecast, spend, spendPrev, data, extraClosed, mitBestand, verlust, keinWhatsApp, dismissed] = await Promise.all([
    computeKpis({ range, customerId, product: produkt, origin: "paid" }) as Promise<Kpis>,
    computeKpis({ range: prev, customerId, product: produkt, origin: "paid" }) as Promise<Kpis>,
    computeMonthlyForecast({ customerId, includeCloseValue: true }),
    retainerCfg ? computeCustomerSpend(customerId, range, retainerCfg) : null,
    retainerCfg ? computeCustomerSpend(customerId, prev, retainerCfg) : null,
    loadErtragData(customerId, produkt ? { leadWhere: { source: produkt } } : {}),
    Promise.all(
      (["empfehlung", "bestand"] as const).map((o) =>
        prisma.lead.count({ where: { customerId, createdAt: { gte: range.from, lte: range.to }, closedAt: { not: null }, ...(produkt ? { source: produkt } : {}), ...originWhere(o) } }),
      ),
    ),
    // „Inkl. Bestand (5 Jahre)“ / „Nur Abschlussprovision“ (je Login gespeichert)
    getBuyerContext().then((c) => loadGewinnMitBestand(c)),
    verlustKarte(customerId, range, { produkt: produkt ?? params.vgp ?? null, berater: params.vgb ?? null }),
    // Offene Leads ohne WhatsApp, noch nicht erreicht: Hebel „anrufen“ (stehen oben auf der Anrufliste)
    prisma.lead.count({
      where: {
        customerId,
        isTest: false,
        erasedAt: null,
        waUnavailableAt: { not: null },
        reached: false,
        closedAt: null,
        lostAt: null,
        OR: [{ status: null }, { status: { notIn: [CLOSED_STATUS, "Storno", ...LOST_STATUSES] } }],
      },
    }),
    prisma.customer.findUnique({ where: { id: customerId }, select: { zahlenTipsDismissed: true } }).then((c) => c?.zahlenTipsDismissed ?? null),
  ]);

  // Lead-Kosten aus Kundensicht: Pro-Lead-Kunden = Lead-Preis (Revenue),
  // Paket-Kunden (Retainer) = eigenes Werbebudget + Retainer.
  // Produktfilter: Lead-Preise je Lead sind schon nach Produkt gefiltert (computeKpis); Werbebudget und Betreuung gibt es
  // nur je Kunde, darum anteilig nach den bezahlten Leads des Produkts (Hinweis unter der Rechnung)
  const [alleK, alleP] = produkt
    ? await Promise.all([
        computeKpis({ range, customerId, product: null, origin: "paid" }) as Promise<Kpis>,
        computeKpis({ range: prev, customerId, product: null, origin: "paid" }) as Promise<Kpis>,
      ])
    : [k, p];
  const anteilVon = (teil: Kpis, ganz: Kpis) => (ganz.nettoLeads > 0 ? teil.nettoLeads / ganz.nettoLeads : 0);
  const anteil = produkt ? anteilVon(k, alleK) : undefined;
  const anteilPrev = produkt ? anteilVon(p, alleP) : undefined;
  // Werbebudget je Produkt aus den Kampagnen des Produkts (Ole, 24.11.2026, lib/werbebudget-produkt.ts); ohne
  // Kampagnenkosten anteilig nach Leads. Betreuung (Retainer) bleibt anteilig nach Leads.
  const [werbe, werbePrev] = produkt && spend
    ? await Promise.all([
        ladeWerbeAnteil(customerId, range, produkt, anteil ?? 0).catch(() => null),
        ladeWerbeAnteil(customerId, prev, produkt, anteilPrev ?? 0).catch(() => null),
      ])
    : [null, null];
  const teil = (s: { adSpend: number; retainer: number }, werbeA: number | null, leadA: number | undefined) =>
    leadA === undefined ? s.adSpend + s.retainer : s.adSpend * (werbeA ?? leadA) + s.retainer * leadA;
  const cost = spend ? teil(spend, werbe, anteil) : Number(k.revenue);
  const costPrev = spendPrev ? teil(spendPrev, werbePrev, anteilPrev) : Number(p.revenue);

  const [cur, before, chancen, tipSignals] = await Promise.all([
    ertragForRange(customerId, data, range, now, cost, { anteil }),
    ertragForRange(customerId, data, prev, now, costPrev, { anteil: anteilPrev }),
    loadOffeneChancen(customerId, data.rates, now, { produkt }),
    loadTipSignals(customerId, data, now).catch(() => null),
  ]);
  // Gesamtbestand (alle bisherigen Verträge) nur in den Details; im Hero nur der Bestand dieser Kunden (prov.futureTrail)
  const bestand = bestandOf(data, now);
  const makler = data.typ === "makler";
  const prov = cur.provision;
  const perCustomer = contractsPerCustomer(data.contracts);
  const a = cur.agency;
  const paket = !!spend;

  // Neue Kunden = erste Verträge im Zeitraum (wie der Trichter nach Eingang des Leads), alle Herkünfte; Makler auch
  // Kunden, die nur über eine bestätigte Bestandsübertragung gekommen sind (Maklervollmacht)
  const inRange = (d: Date) => d >= range.from && d <= range.to;
  const neueKunden = new Set(data.contracts.filter((c) => (c.primary || c.uebertragung) && inRange(c.periodAt)).map((c) => c.leadId)).size;
  // Wert pro Kunde aus allen bisherigen Abschlüssen, falls im Zeitraum noch keiner da ist (für „X bis Y Abschlüsse“)
  const alle = summarizeProvision(data.contracts, data.rates, { from: new Date(0), to: now }, { now, storno: data.storno });
  const kundenBisher = new Set(data.contracts.filter((c) => c.primary).map((c) => c.leadId)).size;
  const wertProKundeBisher = kundenBisher > 0 ? (alle.firstYear + (mitBestand ? alle.futureTrail : 0)) / kundenBisher : null;

  const rechnung = rechnetSich({ provision: prov.firstYear, bestand: prov.futureTrail, kosten: cur.costs, mitBestand, kunden: neueKunden, wertProKundeBisher });
  const satz = antwort(rechnung, { kunden: neueKunden, vertraege: prov.contracts, chancen: chancen.anzahl, mitBestand });

  // Rechnung im Hero: Summe der Zeilen = Ergebnis
  const provLabel = makler ? "Courtage 1. Jahr" : "Abschlussprovision";
  const zeilen: RechnungZeile[] = [{ label: provLabel, betrag: prov.firstYear + prov.chargeback }];
  if (prov.chargeback > 0) zeilen.push({ label: "Rückbelastung (gekündigte Verträge)", betrag: -prov.chargeback });
  if (mitBestand) zeilen.push({ label: `${makler ? "Bestandscourtage" : "Bestandsprovision"} dieser Kunden (5 Jahre)`, betrag: prov.futureTrail });
  if (paket) {
    zeilen.push({ label: "Kosten (Betreuung und Werbebudget)", betrag: -cur.costs });
  } else {
    const n = k.nettoLeads;
    zeilen.push({ label: n > 0 && cur.leadCosts > 0 ? `Kosten (${formatNumber(n)} ${n === 1 ? "Lead" : "Leads"} à ${euro(cur.leadCosts / n)})` : "Kosten (Leads)", betrag: -cur.leadCosts });
    if (Math.abs(a.total) >= 0.5) zeilen.push({ label: "Kosten (Betreuung und Software)", betrag: -a.total });
  }

  // Hebel: bisherige Hinweise (nächster Schritt, Cross-Selling, ohne WhatsApp, Tipps) nach Wirkung, höchstens 3
  const hebel = tipSignals
    ? pickTips({ ...tipSignals, keinWhatsApp }, dismissed, now).map((t) => ({
        key: t.key,
        title: t.kurz?.title ?? t.title,
        text: t.kurz?.text ?? t.text,
        href: t.href,
        cta: t.kurz?.cta ?? t.cta,
      }))
    : [];

  const [empfClosed, bestandClosed] = extraClosed;
  const extras = [
    empfClosed > 0 ? `+ ${formatNumber(empfClosed)} ${empfClosed === 1 ? "Abschluss" : "Abschlüsse"} aus Empfehlungen` : null,
    // Bestandskampagnen: Abschlüsse je Vertrag (60 Tage nach dem Anschreiben, letzte Kampagne zählt), wie in „Kosten & Ertrag“
    !bestandAn ? null : prov.byOrigin.bestand.contracts > 0 ? `+ ${formatNumber(prov.byOrigin.bestand.contracts)} aus Bestandskampagnen` : bestandClosed > 0 ? `+ ${formatNumber(bestandClosed)} aus Bestandskampagnen` : null,
  ].filter((x): x is string => !!x);

  const top = verlust.verteilung.gruende.find((g) => g.key !== "ohne") ?? verlust.verteilung.gruende[0];
  const keep = new URLSearchParams();
  keep.set("range", "max");
  if (produkt) keep.set("produkt", produkt);

  // Details „Kosten und Gewinn“
  const breakdown: [string, number][] = [
    [provLabel, prov.firstYear + prov.chargeback],
    [paket ? "Werbebudget und Betreuung" : "Lead-Kosten", -cur.leadCosts],
    [a.baseInLeadCosts ? "USt. auf den Retainer" : "Betreuung & Software", -a.betreuung],
  ];
  if (a.logins > 0) breakdown.push(["Weitere Logins", -a.logins]);
  if (a.module > 0) breakdown.push(["Zusatzmodule", -a.module]);
  if (a.whatsapp > 0) breakdown.push(["WhatsApp-Gebühren", -a.whatsapp]);
  if (a.setup > 0) breakdown.push(["Einrichtung (verteilt)", -a.setup]);
  if (a.gutschrift > 0) breakdown.push(["Gutschrift Empfehlung", a.gutschrift]);
  if (prov.chargeback > 0) breakdown.splice(1, 0, ["Rückbelastung (gekündigte Verträge)", -prov.chargeback]);
  const bestandWort = makler ? "Bestandscourtage" : "Bestandsprovision";
  const stornoPct = `${(Math.round(bestand.storno * 1000) / 10).toLocaleString("de-DE")} %`;
  const provSub = [
    prov.crossSell.contracts > 0
      ? `davon Cross-Selling: ${formatNumber(prov.crossSell.contracts)} ${prov.crossSell.contracts === 1 ? "Vertrag" : "Verträge"}, ${euro(prov.crossSell.amount)}`
      : null,
    prov.byOrigin.empfehlung.amount > 0 ? `davon aus Empfehlungen: ${euro(prov.byOrigin.empfehlung.amount)}` : null,
    bestandAn && prov.byOrigin.bestand.contracts > 0
      ? `aus Bestandskampagnen: ${formatNumber(prov.byOrigin.bestand.contracts)} ${prov.byOrigin.bestand.contracts === 1 ? "Abschluss" : "Abschlüsse"}, ${euro(prov.byOrigin.bestand.amount)}`
      : null,
    perCustomer != null && perCustomer > 1 ? `Verträge pro Kunde (seit Start): ${perCustomer.toLocaleString("de-DE")}` : null,
    prov.honorar > 0 ? `davon Honorar (vom Kunden): ${euro(prov.honorar)}` : null,
  ].filter((x): x is string => !!x);
  const proStufe: [string, number | null][] = [
    ["pro Lead", k.nettoLeads > 0 ? cost / k.nettoLeads : null],
    ["pro Termin", k.terminLeads > 0 ? cur.costs / k.terminLeads : null],
    ["pro Abschluss", k.closedLeads > 0 ? cur.costs / k.closedLeads : null],
  ];
  const ergebnisVorher = mitBestand ? before.gewinnMitBestand : before.gewinn;

  const r = rechnung.ausEinemEuro;
  const wert = rechnung.wertProKunde;
  const chancenUnter = { aufteilung: chancenAufteilung(chancen), realistisch: `≈ ${euro(chancen.realistisch)} ${chancen.schaetzung ? "geschätzt" : "realistisch"}` };

  return (
    <div className="space-y-5 sm:space-y-6">
      <RechnetSich
        rechnung={rechnung}
        antwort={satz}
        zeilen={zeilen}
        mitBestand={mitBestand}
        makler={makler}
        aktion={rechnung.status === "ohne_kosten" ? { href: "#budget", label: "Werbebudget ansehen" } : null}
      />
      {produktLabel && (paket || cur.agency.total !== 0) ? (
        <p className="-mt-2 text-sm text-[color:var(--muted)]" data-produkt-hinweis>
          Nur {produktLabel}.{" "}
          {paket && werbe !== null
            ? `Werbebudget aus den Kampagnen dieses Produkts, Betreuung anteilig nach Leads (${Math.round((anteil ?? 0) * 100)} %).`
            : `Werbebudget und Betreuung anteilig nach Leads (${Math.round((anteil ?? 0) * 100)} %).`}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4" data-kennzahlen>
        <Kennzahl
          data="kunden"
          label="Neue Kunden"
          wert={formatNumber(neueKunden)}
          unter={
            prov.contracts > 0
              ? `mit ${formatNumber(prov.contracts)} ${prov.contracts === 1 ? "Vertrag" : "Verträgen"}${prov.crossSell.contracts > 0 ? `, davon ${formatNumber(prov.crossSell.contracts)} Cross-Selling` : ""}${prov.uebertragung.contracts > 0 ? `, ${formatNumber(prov.uebertragung.contracts)} übertragen` : ""}`
              : "noch kein Abschluss im Zeitraum"
          }
        />
        <Kennzahl
          data="wert"
          label="Wert pro Kunde"
          wert={wert != null ? euro(wert) : NOCH_KEINE_DATEN}
          ton={wert != null ? "geld" : "normal"}
          unter={
            wert == null
              ? "nach dem ersten Abschluss"
              : `${rechnung.wertAusFrueher ? "Schnitt bisher, " : ""}${mitBestand ? "Provision inkl. 5 Jahre Bestand" : makler ? "Courtage 1. Jahr" : "Abschlussprovision"}`
          }
        />
        <Kennzahl
          data="euro"
          label="Aus 1 € werden"
          wert={r != null ? euroCent(r) : NOCH_KEINE_DATEN}
          ton={r != null && r >= 1 ? "geld" : "normal"}
          unter={r == null ? "ohne Kosten im Zeitraum" : `${mitBestand ? "inkl. Bestand" : "ohne Bestand"}${r < 1 ? ", Ziel über 1 €" : ""}`}
        />
        <ChancenKachel
          anzahl={chancen.anzahl}
          unter={chancenUnter}
          schaetzung={chancen.schaetzung}
          liste={chancen.liste.map((c) => ({ leadId: c.leadId, name: c.name, stufe: c.stufe, provision: c.provision, erwartet: c.erwartet, naechsterSchritt: c.naechsterSchritt }))}
          quoten={{ angebot: chancen.quoten.angebot.quote, termin: chancen.quoten.termin.quote, angebotEigen: chancen.quoten.angebot.eigen, terminEigen: chancen.quoten.termin.eigen }}
        />
      </div>

      <div className="space-y-5 sm:space-y-6">
        <Trichter
          kpis={k}
          verloren={verlust.verteilung.total > 0 ? { anzahl: verlust.verteilung.total, grund: top && top.key !== "ohne" ? top.label : null } : null}
          zusatz={extras}
          alleHref={`?${keep.toString()}`}
        />
        {hebel.length ? <HebelKarte hebel={hebel} canDismiss={canDismiss} /> : null}
      </div>

      <section
        className="divide-y divide-[color:var(--border)] rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-md)]"
        aria-label="Details"
        data-details
      >
        <VerlustKarte customerId={customerId} range={range} params={params} daten={produkt ? { ...verlust, produkte: [] } : verlust} eingebettet />

        <details className="group [&>summary::-webkit-details-marker]:hidden" id="kosten-gewinn" data-kosten-gewinn>
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
            <span className="text-base font-semibold">Kosten und Gewinn im Detail</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
          <div className="space-y-5 border-t border-[color:var(--border)] p-5">
            <div className="grid grid-cols-3 gap-3" data-kosten-pro>
              {proStufe.map(([l, v]) => (
                <div key={l} className="rounded-[var(--radius-md)] bg-[color:var(--background)] p-3 ring-1 ring-inset ring-[color:var(--border)]">
                  <div className="text-sm text-[color:var(--muted)]">Kosten {l}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">{v != null ? euro(v) : NOCH_KEINE_DATEN}</div>
                </div>
              ))}
            </div>

            {/* Vereinfacht (Ole, 18.11.2026): eine Zahl, darunter Provision minus Kosten; Einzelposten aufklappbar */}
            <div data-gewinn>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold">Gewinn in diesem Zeitraum</h3>
                <span className={`shrink-0 whitespace-nowrap text-xl font-semibold tabular-nums ${(mitBestand ? cur.gewinnMitBestand : cur.gewinn) < 0 ? "text-rose-700" : "text-emerald-700"}`} data-gewinn-wert>
                  {euroMitVorzeichen(mitBestand ? cur.gewinnMitBestand : cur.gewinn)}
                </span>
              </div>
              <dl className="mt-2 space-y-1 tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--muted)]">{provLabel}</dt>
                  <dd className="shrink-0 whitespace-nowrap">{euroMitVorzeichen(prov.firstYear)}</dd>
                </div>
                {prov.uebertragung.contracts > 0 ? (
                  <div className="flex justify-between gap-3 pl-3 text-sm" data-davon-uebertragung>
                    <dt className="text-[color:var(--muted)]">davon Bestandsübertragungen</dt>
                    <dd className="shrink-0 whitespace-nowrap">{euro(prov.uebertragung.amount)}</dd>
                  </div>
                ) : null}
                {mitBestand ? (
                  <div className="flex justify-between gap-3" data-kuenftiger-bestand>
                    <dt className="text-[color:var(--muted)]">
                      {bestandWort} (5 Jahre) <InfoHinweis begriff={`${bestandWort} (5 Jahre)`} text={bestandErklaert(bestandWort)} />
                    </dt>
                    <dd className="shrink-0 whitespace-nowrap">{euroMitVorzeichen(cur.gewinnMitBestand - cur.gewinn)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-[color:var(--muted)]">Kosten</dt>
                  <dd className="shrink-0 whitespace-nowrap">{euroMitVorzeichen(cur.gewinn - prov.firstYear)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-sm text-[color:var(--muted)]" data-gewinn-nur-jetzt>
                {mitBestand ? `Ohne Bestand: ${euroMitVorzeichen(cur.gewinn)} · ` : `Mit Bestand (5 Jahre): ${euroMitVorzeichen(cur.gewinnMitBestand)} · `}
                Vorzeitraum: {euroMitVorzeichen(ergebnisVorher)}
              </p>
              <details className="group/e mt-2 [&>summary::-webkit-details-marker]:hidden">
                <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-[color:var(--brand)]">
                  Einzelposten
                  <ChevronDown className="h-3.5 w-3.5 transition group-open/e:rotate-180" />
                </summary>
                <dl className="mt-2 space-y-1 text-sm tabular-nums">
                  {breakdown
                    .filter(([, v]) => Math.round(v) !== 0)
                    .map(([l, v]) => (
                      <div key={l} className="flex justify-between gap-3">
                        <dt className="text-[color:var(--muted)]">{l}</dt>
                        <dd className="shrink-0 whitespace-nowrap">{euroMitVorzeichen(v)}</dd>
                      </div>
                    ))}
                </dl>
                <p className="mt-2 text-sm text-[color:var(--muted)]" data-prov-aus>
                  {provLabel} {provisionAusText(prov, makler)}
                  {provSub.length ? `; ${provSub.join("; ")}` : ""}.
                </p>
              </details>
            </div>

            <div data-gesamtbestand>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] font-semibold">
                  {bestandWort} <span className="font-normal text-[color:var(--muted)]">(ganzer Bestand)</span>{" "}
                  <InfoHinweis begriff={`${bestandWort} pro Jahr`} text={bestandErklaert(bestandWort)} />
                </h3>
                <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums text-emerald-700">{euroMitVorzeichen(bestand.perYear)} pro Jahr</span>
              </div>
              <p className="mt-1 text-sm text-[color:var(--muted)]">
                Aus {formatNumber(bestand.contracts)} {bestand.contracts === 1 ? "laufendem Vertrag" : "laufenden Verträgen"}, in 5 Jahren {euro(bestand.inYears)} (Storno {stornoPct},{" "}
                <a href="/buyer/provisionen#storno" className="font-medium text-[color:var(--brand)] underline">ändern</a>).
                {bestand.real.quote != null ? (
                  <span data-storno-real> Tatsächlich: {(Math.round(bestand.real.quote * 1000) / 10).toLocaleString("de-DE")} %.</span>
                ) : null}
              </p>
            </div>

{(() => {
              // Hochrechnung als ein Satz statt Tabelle (Ole, 18.11.2026): nur Abschlüsse und Gewinn bis Monatsende
              const zeile = (l: string) => forecast.rows.find((r) => r.label === l);
              const abschluesse = zeile("Abschlüsse");
              const gewinn = zeile("Gewinn");
              if (!abschluesse || !gewinn || forecast.daysElapsed < 3) return null;
              const monat = new Intl.DateTimeFormat("de-DE", { month: "long" }).format(forecast.monthStart);
              const n = Math.round(abschluesse.projected);
              return (
                <p className="text-sm text-[color:var(--muted)]" data-hochrechnung>
                  Wenn der {monat} so weiterläuft: etwa {formatNumber(n)} {n === 1 ? "Abschluss" : "Abschlüsse"}, Gewinn{mitBestand ? " ohne Bestand" : ""}{" "}
                  <span className="font-medium text-[color:var(--foreground)]">{euroMitVorzeichen(gewinn.projected)}</span> (Vormonat {euroMitVorzeichen(gewinn.previousFull)}).
                </p>
              );
            })()}

            {bestand.growth.some((g) => g.total > 0) ? (
              <BestandGrowthSection
                points={bestand.growth}
                intro={`${bestandWort} pro Jahr, wenn Sie so weitermachen wie in den letzten 3 Monaten (${bestand.perMonth.toLocaleString("de-DE")} ${bestand.perMonth === 1 ? "Vertrag" : "Verträge"} pro Monat), mit ${stornoPct} Storno pro Jahr.`}
              />
            ) : null}
          </div>
        </details>

        <details className="group [&>summary::-webkit-details-marker]:hidden" id="so-rechnen-wir" data-so-rechnen-wir>
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
            <span className="text-base font-semibold">So rechnen wir</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
          </summary>
          <ul className="space-y-2 border-t border-[color:var(--border)] p-5 text-[15px] leading-relaxed text-[color:var(--muted)]" data-gewinn-erklaerung>
            <Punkt k="Ergebnis:">
              {provLabel} aus Ihren Abschlüssen{mitBestand ? ` plus ${bestandWort} dieser Kunden` : ""} minus Ihre Kosten im Zeitraum (
              {paket ? "Betreuung und Werbebudget" : "Leads, Betreuung und Software"} inkl. USt., Einrichtung verteilt über die Laufzeit).
            </Punkt>
            <Punkt k="Inkl. Bestand (5 Jahre):">
              die {bestandWort} der Verträge aus diesem Zeitraum für die nächsten 5 Jahre, geschätzt mit Ihrer Stornoquote von {stornoPct} pro Jahr. Ihr
              übriger Bestand zählt hier nicht, er steht unter Kosten und Gewinn im Detail.
            </Punkt>
            <Punkt k={makler ? "Nur 1. Jahr:" : "Nur Abschlussprovision:"}>nur, was im Zeitraum schon verdient ist.</Punkt>
            <Punkt k="Wert pro Kunde:">Provision geteilt durch die neuen Kunden; daraus die fehlenden Abschlüsse bis zum Break-even.</Punkt>
            <Punkt k="Offene Chancen:">
              Angebote ohne Entscheidung, gebuchte Termine, Termine ohne Ergebnis und Bedenkzeiten (Ihr Kunde überlegt nach dem Angebot noch). Realistisch = Provision bei Abschluss mal Ihre Quote
              (Angebot {Math.round(chancen.quoten.angebot.quote * 100)} %, Termin {Math.round(chancen.quoten.termin.quote * 100)} %)
              {chancen.schaetzung ? ", bis 10 eigene Fälle je Stufe da sind mit einer Standardquote (Schätzung)" : ", aus Ihren Fällen der letzten 12 Monate"}.
            </Punkt>
            <Punkt k="Vom Lead zum Kunden:">nur bezahlte Leads, damit die Quoten stimmen. Provision zählt alle Abschlüsse, auch aus Empfehlungen.</Punkt>
            <Punkt k="Provision:">mit Ihren Sätzen aus <a href="/buyer/provisionen" className="font-medium text-[color:var(--brand)] underline">Meine Provisionen</a>, geschätzt.</Punkt>
          </ul>
        </details>
      </section>
    </div>
  );
}

/** Stichpunkt: fetter Begriff, dann Erklärung (hängender Einzug). */
function Punkt({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <li className="pl-3 -indent-3">
      • <strong className="font-semibold text-[color:var(--foreground)]">{k}</strong> {children}
    </li>
  );
}

/**
 * Pay-per-Lead + Software: statt Werbebudget, Produkten und Pause eine Karte zum Bestellen (eine Hauptaktion). Ohne
 * eingerichteten Bezug: kurzer Hinweis, dass wir ihn einrichten (Aufgabe aus dem Onboarding).
 */
function LeadsBestellenKarte({ bestellbar }: { bestellbar: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 py-4" data-leads-bestellen-karte>
      <div className="min-w-0">
        <div className="font-semibold">Leads bestellen</div>
        <p className="text-sm text-[color:var(--muted)]">
          {bestellbar ? "Exklusive Leads pro Woche, Ihr Assistent schreibt jeden sofort an." : "Wir richten Ihren Bezug gerade ein und melden uns, sobald Sie bestellen können."}
        </p>
      </div>
      {bestellbar ? (
        <a href="/buyer/bestellen" className="inline-flex h-11 items-center rounded-[var(--radius-md)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white hover:bg-[color:var(--brand-dark)]">
          Jetzt bestellen
        </a>
      ) : null}
    </div>
  );
}
