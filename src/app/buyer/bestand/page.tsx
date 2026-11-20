import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, ChevronDown, ChevronRight, Lightbulb, Megaphone, MoreHorizontal, PackagePlus, ShieldCheck, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui";
import type { Prisma } from "@/generated/prisma/client";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { channelAvailability, OCCASIONS, opportunities, type Occasion, type Opportunity } from "@/lib/bestand/campaigns";
import { hasImprint, imprintFromWebsiteInfo } from "@/lib/bestand/kampagnen-mail";
import { deleteDraftCampaignAction, toggleCampaignAction } from "./actions";
import { bestandMailQuota, bestandQuota, QUOTA_PAUSE } from "@/lib/bestand/quota";
import { PRICE_LIST, bestandPacksText, eur, isPrepaid, normalizeRhythmus, RHYTHMUS_MONATE } from "@/lib/offer-pricing";
import { displayName } from "@/lib/bestand/rows";
import { lastUndoableImport } from "@/lib/bestand/import";
import { autoTopUpState, packPurchaseBlocker, resumeQuotaPausedCampaigns } from "@/lib/bestand/packs";
import { QuotaBar, type PackBooking } from "@/components/bestand/quota-bar";
import { AutoTopUpForm, PackBookButton } from "@/components/bestand/packs";
import { ImportUndoButton } from "@/components/bestand/import-undo";
import { ModuleBookButton } from "@/components/bestand/module-book";
import { canSelfBookBestand } from "@/lib/bestand/self-service";
import { loadCustomerProvision } from "@/lib/provision-server";
import { groupStats, loadCampaignStats, loadPeriodTiles, quote } from "@/lib/bestand/statistik";
import { eigeneZahlen, spanneText } from "@/lib/bestand/potenzial";
import { loadConsentSettings, loadOfferReach, loadSuppression, subjectOf, waWindowOpenFor } from "@/lib/bestand/einwilligung-server";
import { consentRequestByMailAllowed, OFFER_REACH_GOAL, reachableForOffers } from "@/lib/bestand/einwilligung";
import { ConsentBadges } from "@/components/bestand/consent-actions";
import { KundeAktionen } from "@/components/bestand/kunde-aktionen";
import { KundenSuche } from "@/components/bestand/kunden-suche";
import { isExclusiveAgent } from "@/lib/bestand/befugnis";
import { loadCustomerContracts } from "@/lib/vertraege";
import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";
import { bestandVisible } from "@/lib/bestand/sichtbar";
import { bestandMitMails } from "@/lib/mail/kontakt-mail";
import { BestandMailVerlauf } from "@/components/bestand/mail-verlauf";

// Bestand-Cockpit (Plan docs/ux/2026-11-19-bestand-champions.md, Paket 1): „App öffnen, sehen wen ich heute ansprechen
// soll und warum, mit Euro-Potenzial, ein Tipp.“ Reihenfolge: Heute zuerst (einziger primärer Knopf), Hinweise als
// Chips, weitere Chancen nach Euro, 3 Ergebnis-Kacheln, Kampagnen mit einer Aktion je Zustand, Kunden. Kontingent,
// Pakete, Nachbuchen, Import, Vergleichstabellen und Erklärsätze unter „Mehr“. Euro-Werte sind Schätzungen, nur intern.

export const dynamic = "force-dynamic";
export const metadata = { title: "Bestand | performancegrowth" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  running: { label: "läuft", tone: "success" },
  paused: { label: "pausiert", tone: "warning" },
  done: { label: "fertig", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

const eurRound = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const de = (n: number) => n.toLocaleString("de-DE");

const PERIODS = [30, 90, 365] as const;

/** Filter der Kundenliste (Paket 3): Chips statt Formular, gelten sofort. */
const FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "ohne", label: "Ohne Einwilligung" },
  { key: "chance", label: "Mit Chance" },
  { key: "angeschrieben", label: "Angeschrieben" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
/** „Mehr laden“ in Schritten von 25 (Handy: kurze Seite) */
const LIST_STEP = 25;
const pct = (x: number) => `${Math.round(x * 100).toLocaleString("de-DE")} %`;

/** Kontingent oben nur bei unter 20 % frei (oder bei einer Pause wegen Kontingent). */
const QUOTA_TOP_SHARE = 0.2;

/** Link einer Chance: Kampagne vorbelegt bzw. Einwilligungen. */
function oppHref(o: Opportunity): string {
  if (o.kind === "einwilligung") return "/buyer/bestand/einwilligungen";
  return `/buyer/bestand/kampagne?${new URLSearchParams({ anlass: o.occasion, segment: JSON.stringify(o.segment), ...(o.topic ? { thema: o.topic } : {}) })}`;
}

/** Überschrift mit Zahl: „22 Kfz-Kunden ohne Hausrat“, „Jahresgespräch: 140 Kunden“. */
function oppHeadline(o: Opportunity): string {
  if (o.kind === "einwilligung") return `${de(o.count)} Kunden erreichbar mit Einwilligung`;
  if (o.occasion === "cross_sell") return `${de(o.count)} ${o.title}`;
  return `${o.title}: ${de(o.count)} Kunden`;
}

/** „15 per WhatsApp · 7 per E-Mail“ */
function channelLine(o: Opportunity): string {
  return [o.whatsapp ? `${de(o.whatsapp)} per WhatsApp` : "", o.email ? `${de(o.email)} per E-Mail` : ""].filter(Boolean).join(" · ");
}

export default async function BestandPage({ searchParams }: { searchParams: Promise<{ q?: string; gestartet?: string; kontingent?: string; sort?: string; tage?: string; mehr?: string; filter?: string; n?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const c = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { existingCustomersEnabled: true, bestandSichtbar: true, bestandRequestedAt: true, bestandCancelAt: true, billingInterval: true, prepayFreeMonths: true, empfehlungEnabled: true, vermittlerTyp: true },
  });
  if (!c) redirect("/buyer");
  // Modul vorerst ausgeblendet (lib/bestand/sichtbar.ts): ohne Schalter und ohne aktives Modul zurück zu Heute
  if (!bestandVisible(c, { admin: ctx.preview })) redirect("/buyer");
  // Ohne gebuchtes Modul: freundlicher Hinweis statt Sperre ohne Erklärung
  if (!c.existingCustomersEnabled) {
    const check = await canSelfBookBestand(ctx.customerId);
    return (
      <LockedBestand
        requestedAt={c.bestandRequestedAt?.toISOString() ?? null}
        readOnly={ctx.preview}
        canBook={check.ok}
        reason={check.ok ? null : check.reason}
        annual={isPrepaid(c.billingInterval)}
        prepayMonths={RHYTHMUS_MONATE[normalizeRhythmus(c.billingInterval)]}
        freeMonths={c.prepayFreeMonths}
      />
    );
  }
  const { q = "", gestartet, kontingent, sort, tage, mehr, filter: filterRaw, n: nRaw } = await searchParams;
  const filter = FILTERS.find((f) => f.key === filterRaw)?.key ?? "alle";
  const pageSize = Math.min(1000, Math.max(LIST_STEP, Math.floor(Number(nRaw) / LIST_STEP) * LIST_STEP || LIST_STEP));
  const days = PERIODS.find((d) => String(d) === tage) ?? 90;
  const byValue = sort === "beitrag";
  const customerId = ctx.customerId;
  const now = new Date();
  let quota = await bestandQuota(customerId, now);
  // Fehler behoben (19.11.2026): Am Kontingent pausierte Kampagnen laufen weiter, sobald wieder etwas frei ist
  // (nicht erst beim nächsten Versandlauf). In der Admin-Vorschau nichts ändern: dort steht „Fortsetzen“.
  if (quota.remaining > 0 && !ctx.preview) {
    if (await resumeQuotaPausedCampaigns(customerId, now)) quota = await bestandQuota(customerId, now);
  }
  const [packBlocker, autoState, lastImport, waiting] = await Promise.all([
    packPurchaseBlocker(customerId),
    autoTopUpState(customerId),
    lastUndoableImport(customerId),
    prisma.campaignRecipient.count({ where: { status: "queued", channel: "whatsapp", campaign: { customerId, status: { in: ["running", "paused"] } } } }),
  ]);
  const booking: PackBooking = {
    packs: PRICE_LIST.bestandPacks,
    months: PRICE_LIST.bestandPackMonths,
    individualFrom: PRICE_LIST.bestandPackIndividualFrom,
    readOnly: ctx.preview,
    blocker: packBlocker,
  };

  const [total, optOut, blocked, volume, provision, consentSettings, suppression, legacy, noProof] = await Promise.all([
    prisma.existingCustomer.count({ where: { customerId } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: { not: null } } }),
    prisma.existingCustomer.count({ where: { customerId, blockedAt: { not: null } } }),
    prisma.existingCustomer.aggregate({ where: { customerId, premiumTotal: { not: null } }, _sum: { premiumTotal: true }, _count: { _all: true } }),
    loadCustomerProvision(customerId),
    loadConsentSettings(customerId),
    loadSuppression(customerId),
    prisma.existingCustomer.count({ where: { customerId, OR: [{ whatsappConsentSource: "versicherer_pauschal" }, { emailConsentSource: "versicherer_pauschal" }] } }),
    // Ohne Nachweis zum Widerspruchshinweis (§ 7 Abs. 3 UWG): per E-Mail nur mit Einwilligung
    prisma.existingCustomer.count({
      where: { customerId, email: { not: null }, emailConsent: null, optOutAt: null, emailOptOutAt: null, OR: [{ widerspruchHinweis: null }, { widerspruchHinweis: "nein" }] },
    }),
  ]);
  // Beitragsvolumen aktiver Verträge und grobe Bestandsprovision (Satz für Sach/Privatschutz aus „Meine Provisionen“)
  const premiumSum = Number(volume._sum.premiumTotal ?? 0);
  const ps = provision.rates.privatschutz;
  const trailRate = ps?.kind === "percent" ? (ps.trail ?? 0) : 0;
  const contracts = total ? await loadCustomerContracts(customerId).catch(() => []) : [];
  const [stats, tiles] = total
    ? await Promise.all([loadCampaignStats(customerId, { contracts, rates: provision.rates }), loadPeriodTiles(customerId, { from: new Date(now.getTime() - days * 86_400_000), to: now })])
    : [[], null];
  // Chancen nach erwarteter Provision: eigene Sätze und, ab 30 eigenen Empfängern je Anlass, eigene Quoten
  // E-Mail gerade nicht möglich (kein Postfach, kein Impressum, Monatsgrenze): Chancen zählen wie die Kampagne nur WhatsApp
  const mailBlocked = total
    ? await Promise.all([channelAvailability(customerId, "review", ctx.userId), bestandMailQuota(customerId)]).then(
        ([av, mq]) => !av.mailbox || !hasImprint(consentSettings.imprint ?? imprintFromWebsiteInfo(consentSettings.websiteInfo)) || mq.remaining <= 0,
      )
    : false;
  const opps = total ? await opportunities(customerId, now, { rates: provision.rates, own: eigeneZahlen(stats), mailBlocked }) : [];
  const top = opps[0] ?? null;
  // Einwilligung steht als Kennzahl mit eigenem Knopf da (Paket 3), nicht noch einmal in „Weitere Chancen“
  const rest = opps.slice(1).filter((o) => o.kind !== "einwilligung");
  const offer = total ? await loadOfferReach(customerId, now) : null;
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  const notConsented = { AND: [{ OR: [{ emailConsent: null }, { emailConsent: { not: "ja" } }] }, { OR: [{ whatsappConsent: null }, { whatsappConsent: { not: "ja" } }] }] };
  const filterWhere: Record<FilterKey, Prisma.ExistingCustomerWhereInput> = {
    alle: {},
    ohne: { optOutAt: null, blockedAt: null, ...notConsented },
    chance: {
      optOutAt: null,
      blockedAt: null,
      AND: [
        { OR: [{ emailConsent: "ja", email: { not: null }, emailOptOutAt: null }, { whatsappConsent: "ja", phone: { not: null } }] },
        { OR: [{ lastCampaignAt: null }, { lastCampaignAt: { lt: thirtyAgo } }] },
      ],
    },
    angeschrieben: { lastCampaignAt: { not: null } },
  };
  const filterCounts = total
    ? Object.fromEntries(await Promise.all(FILTERS.map(async (f) => [f.key, f.key === "alle" ? total : await prisma.existingCustomer.count({ where: { customerId, ...filterWhere[f.key] } })] as const)))
    : {};
  const byOccasion = groupStats(stats, "occasion", (k) => OCCASIONS[k as Occasion]?.label ?? k);
  const byTopic = groupStats(stats, "topic", (k) => k);
  const qDigits = q.replace(/\D/g, "");
  const list = total
    ? await prisma.existingCustomer.findMany({
        where: {
          customerId,
          ...filterWhere[filter],
          ...(q
            ? {
                OR: [
                  { lastName: { contains: q, mode: "insensitive" } },
                  { firstName: { contains: q, mode: "insensitive" } },
                  { company: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                  ...(qDigits.length >= 3 ? [{ phone: { contains: qDigits } }, { externalNo: { contains: q } }] : []),
                ],
              }
            : {}),
        },
        orderBy: byValue
          ? [{ premiumTotal: { sort: "desc", nulls: "last" } }, { lastName: "asc" }]
          : filter === "angeschrieben"
            ? [{ lastCampaignAt: { sort: "desc", nulls: "last" } }, { lastName: "asc" }]
            : [{ lastName: { sort: "asc", nulls: "last" } }, { firstName: "asc" }, { company: { sort: "asc", nulls: "last" } }, { email: "asc" }],
        take: pageSize,
      })
    : [];
  const listTotal = filter === "alle" && !q ? total : null;
  // WhatsApp-Knopf für den Einwilligungslink nur im offenen 24-h-Fenster (der Kunde hat selbst geschrieben)
  const waOpen = await waWindowOpenFor(customerId, list.map((e) => e.phone).filter((p): p is string => !!p), now);
  // E-Mail-Verlauf: Knopf nur bei Kunden, an die schon E-Mails gingen
  const withMails = await bestandMitMails(customerId, list.map((e) => e.id));

  const quotaPaused = stats.some((k) => k.status === "paused" && k.pausedReason === QUOTA_PAUSE);
  const quotaTotal = quota.remaining + quota.sentThisMonth;
  const quotaTop = quotaPaused || (quotaTotal > 0 && quota.remaining < QUOTA_TOP_SHARE * quotaTotal);
  // Hinweis zur Einwilligung als Chip mit Zahl, der Rechtssatz im Aufklapper „Warum?“
  const consentHint =
    total && legacy > 0 && !consentSettings.legacyReviewedAt
      ? {
          chip: `${de(legacy)} Einwilligungen prüfen`,
          why: `Für ${de(legacy)} Kunden gilt die Einwilligung aus Ihrer pauschalen Bestätigung beim Import („laut Versicherer“) für WhatsApp und E-Mail. Bitte prüfen Sie, ob sie nachweisbar ist.`,
        }
      : total && !consentSettings.uwgConfirmed
        ? { chip: "Bestätigung für E-Mails fehlt", why: "Ohne Einwilligung gehen E-Mails nur nach § 7 Abs. 3 UWG raus. Dafür fehlt noch Ihre Bestätigung." }
        : total && noProof > 0
          ? { chip: `${de(noProof)} Kunden ohne Nachweis`, why: `${de(noProof)} Kunden ohne Nachweis zum Hinweis auf das Widerspruchsrecht: E-Mails an sie gehen nur mit Einwilligung.` }
          : null;
  const mehrHref = "/buyer/bestand?mehr=1#mehr";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Bestand"
        subtitle={total ? `${de(total)} Kunden im Bestand` : "Ihre Bestandskunden gezielt ansprechen"}
        actions={total ? <MehrMenu mehrHref={mehrHref} /> : undefined}
      />
      {kontingent && quota.remaining <= 0 ? (
        <p className="mb-2 text-sm font-medium text-amber-900" data-quota-reached>
          Für eine neue Kampagne ist diesen Monat nichts mehr frei.
        </p>
      ) : null}
      {quotaTop ? <QuotaBar quota={quota} booking={booking} waiting={waiting} variant="secondary" /> : null}
      {c.bestandCancelAt ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-bestand-cancel-notice>
          Das Modul ist zum {c.bestandCancelAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} gekündigt. Bis dahin können Sie es wie gewohnt
          nutzen.{" "}
          <Link href="/buyer/konto" className="font-medium underline">
            Kündigung zurücknehmen
          </Link>
        </div>
      ) : null}
      {gestartet ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Kampagne gestartet. Nachrichten gehen Mo–Sa zwischen 9 und 19 Uhr schrittweise raus, Antworten landen als Lead in der Pipeline.
        </div>
      ) : null}

      {!total ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Noch keine Bestandskunden"
            text="Laden Sie Ihre Kundenliste als Excel oder CSV hoch. Danach zeigen wir Ihnen, wen Sie zuerst ansprechen."
            action={<ButtonLink href="/buyer/bestand/import" variant="primary" icon={Upload}>Kunden importieren</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Heute zuerst: beste Chance nach erwarteter Provision, der einzige primäre Knopf der Seite */}
          <Card className="border-[color:var(--brand)]/40">
            <div className="px-5 py-5" data-bestand-hero>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--brand)]">Heute zuerst</p>
              {top ? (
                <>
                  <h2 className="mt-1 text-xl font-semibold leading-snug tracking-tight">{oppHeadline(top)}</h2>
                  {spanneText(top.euro) ? (
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[15px]" data-bestand-hero-euro>
                      <span>
                        <b className="tabular-nums">{spanneText(top.euro)}</b> Provision möglich
                      </span>
                      <Badge>Schätzung</Badge>
                    </p>
                  ) : null}
                  {top.kind === "kampagne" && channelLine(top) ? <p className="mt-1 text-sm text-[color:var(--muted)]">{channelLine(top)}</p> : null}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                    <ButtonLink href={oppHref(top)} variant="primary" size="md" icon={top.kind === "einwilligung" ? ShieldCheck : Megaphone} className="w-full sm:w-auto" >
                      {top.kind === "einwilligung" ? "Einwilligung anfragen" : `${de(top.count)} Kunden anschreiben`}
                    </ButtonLink>
                    <Warum>
                      {top.why} Schätzung aus {top.ownQuotes ? "Ihren bisherigen Kampagnen" : "üblichen Antwort- und Abschlussquoten"} und Ihren Sätzen aus{" "}
                      <Link href="/buyer/provisionen" className="underline">
                        Meine Provisionen
                      </Link>
                      , keine Zusage.
                    </Warum>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">Gerade ist niemand dran</h2>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">Alle Erreichbaren wurden in den letzten 30 Tagen angeschrieben oder brauchen erst eine Einwilligung.</p>
                  <ButtonLink href="/buyer/bestand/einwilligungen" variant="primary" size="md" icon={ShieldCheck} className="mt-4 w-full sm:w-auto">
                    Einwilligungen ansehen
                  </ButtonLink>
                </>
              )}
            </div>
          </Card>

          {consentHint ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-bestand-consent-notice>
              <Link
                href="/buyer/bestand/einwilligungen"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 font-medium text-amber-900 hover:bg-amber-100 sm:min-h-8"
              >
                <ShieldCheck className="h-4 w-4" />
                {consentHint.chip}
              </Link>
              <Warum>{consentHint.why}</Warum>
            </div>
          ) : null}

          {offer && offer.total > 0 ? (
            <Card>
              <div className="px-5 py-4" data-bestand-reach>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-sm font-medium">
                    Für Angebote erreichbar: <b className="tabular-nums">{pct(offer.share)}</b>
                  </p>
                  <span className="text-xs text-[color:var(--muted)]">{offer.share >= OFFER_REACH_GOAL ? `Ziel ${pct(OFFER_REACH_GOAL)} erreicht` : `Ziel ${pct(OFFER_REACH_GOAL)}`}</span>
                </div>
                <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface-sunken)]" aria-hidden>
                  <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${Math.min(100, Math.round(offer.share * 100))}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-[color:var(--foreground)]/40" style={{ left: `${OFFER_REACH_GOAL * 100}%` }} />
                </div>
                {offer.withoutConsent > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p className="min-w-0 flex-1 text-sm text-[color:var(--muted)] tabular-nums">+{de(offer.withoutConsent)} Kunden erreichbar mit Einwilligung</p>
                    {top?.kind !== "einwilligung" ? (
                      <ButtonLink href="/buyer/bestand/einwilligungen" icon={ShieldCheck}>
                        Einwilligung anfragen
                      </ButtonLink>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          {rest.length ? (
            <Card>
              <CardHeader title="Weitere Chancen" icon={Lightbulb} hint="nach möglicher Provision" />
              <ul className="divide-y divide-[color:var(--border)]" data-bestand-chancen>
                {/* Ganze Zeile tippbar, Titel bricht um statt abgeschnitten zu werden (Handy) */}
                {rest.map((o) => (
                  <li key={`${o.kind}-${o.occasion}-${o.title}`} data-bestand-chance={o.kind}>
                    <Link href={oppHref(o)} className="flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-[color:var(--surface-sunken)]">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-snug">{o.title}</div>
                        <div className="text-xs text-[color:var(--muted)] tabular-nums">
                          {o.kind === "einwilligung" ? "+" : ""}
                          {de(o.count)} Kunden{spanneText(o.euro) ? ` · ${spanneText(o.euro)}` : ""}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {stats.length && tiles ? (
            <Card>
              <CardHeader title="Ergebnis" icon={BarChart3} />
              <div className="px-5 py-4" data-bestand-stats>
                <div className="mb-3 flex flex-wrap gap-2 text-sm" data-bestand-period>
                  {PERIODS.map((d) => (
                    <Link
                      key={d}
                      href={`/buyer/bestand?tage=${d}`}
                      aria-current={d === days ? "true" : undefined}
                      className={`inline-flex min-h-10 items-center rounded-full border px-3 sm:min-h-8 ${d === days ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold" : "border-[color:var(--border)]"}`}
                    >
                      {d === 365 ? "12 Monate" : `${d} Tage`}
                    </Link>
                  ))}
                </div>
                <dl className="grid grid-cols-3 gap-2 sm:gap-3" data-bestand-tiles>
                  {[
                    {
                      label: "Antworten",
                      value: de(tiles.funnel.gesamt.geantwortet),
                      sub: `${(quote(tiles.funnel.gesamt.geantwortet, tiles.funnel.gesamt.angeschrieben) ?? 0).toLocaleString("de-DE")} % von ${de(tiles.funnel.gesamt.angeschrieben)}`,
                    },
                    { label: "Termine", value: de(tiles.funnel.gesamt.termin), sub: `${de(tiles.funnel.gesamt.abschluss)} Abschlüsse` },
                    {
                      label: "Provision",
                      value: eurRound(tiles.funnel.gesamt.provision),
                      sub: tiles.funnel.gesamt.bestandProJahr > 0 ? `+ ${eurRound(tiles.funnel.gesamt.bestandProJahr)} pro Jahr` : "1. Jahr",
                    },
                  ].map((t) => (
                    <div key={t.label} className="min-w-0 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5">
                      <dt className="text-xs text-[color:var(--muted)]">{t.label}</dt>
                      <dd className="truncate text-lg font-semibold tabular-nums sm:text-xl">{t.value}</dd>
                      <dd className="text-[11px] leading-tight text-[color:var(--muted)]">{t.sub}</dd>
                    </div>
                  ))}
                </dl>
                <details className="group mt-2 text-xs text-[color:var(--muted)] [&>summary::-webkit-details-marker]:hidden">
                  <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1 font-medium">
                    So zählen wir <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-1">
                    Angeschrieben: {de(tiles.funnel.whatsapp.angeschrieben)} per WhatsApp, {de(tiles.funnel.email.angeschrieben)} per E-Mail. Abschlüsse zählen, wenn sie
                    innerhalb von 60 Tagen nach dem Anschreiben kommen (bei mehreren Kampagnen die letzte). Provision mit Ihren Sätzen je Sparte, Empfehlungen zählen nicht
                    doppelt.
                  </p>
                </details>
              </div>
            </Card>
          ) : null}

          {stats.length ? (
            <Card menus>
              <CardHeader title="Kampagnen" icon={Megaphone} count={stats.length} />
              <ul className="divide-y divide-[color:var(--border)]" data-bestand-campaigns>
                {stats.map((k) => {
                  const g = k.funnel.gesamt;
                  const anlass = OCCASIONS[k.occasion as Occasion]?.label ?? k.occasion;
                  const name = k.name.replace(/\bKFZ\b/g, "Kfz");
                  // Anlass-Chip nur, wenn er etwas Neues sagt („Ablauf/Wechsel“ und „Ablauf / Wechsel“ sind dasselbe)
                  const sameAsName = name.replace(/\s+/g, "").toLowerCase() === anlass.replace(/\s+/g, "").toLowerCase();
                  const quotaStop = k.status === "paused" && k.pausedReason === QUOTA_PAUSE && quota.remaining <= 0;
                  return (
                    <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm" data-bestand-campaign={k.status}>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={`/buyer/bestand/kampagnen/${k.id}`} className="truncate font-medium hover:underline">
                            {name}
                          </Link>
                          {!sameAsName ? <span className="rounded-full bg-[color:var(--surface-sunken)] px-2 py-0.5 text-[11px] text-[color:var(--muted)]">{anlass}</span> : null}
                          <Badge tone={STATUS[k.status]?.tone ?? "neutral"}>{quotaStop ? "pausiert: Kontingent" : (STATUS[k.status]?.label ?? k.status)}</Badge>
                        </div>
                        <div className="text-xs text-[color:var(--muted)] tabular-nums">
                          {k.status === "draft"
                            ? "Noch nicht gestartet"
                            : `${de(g.geantwortet)} Antworten · ${de(g.abschluss)} Abschlüsse · ${eurRound(g.provision)}${g.wartend ? ` · ${de(g.wartend)} warten` : ""}`}
                        </div>
                      </div>
                      <CampaignAction id={k.id} status={k.status} quotaStop={quotaStop} booking={booking} readOnly={ctx.preview} />
                    </li>
                  );
                })}
              </ul>
              {stats.length > 1 ? (
                <details className="group border-t border-[color:var(--border)] [&>summary::-webkit-details-marker]:hidden" data-bestand-compare>
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-5 py-2 text-sm font-medium">
                    Vergleich nach Anlass und Sparte
                    <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
                  </summary>
                  <div className="grid gap-4 px-5 pb-4 text-sm sm:grid-cols-2">
                    {[
                      { title: "Nach Anlass", rows: byOccasion },
                      { title: "Nach Thema bzw. Sparte", rows: byTopic },
                    ].map((t) => (
                      <div key={t.title}>
                        <p className="mb-1 font-medium">{t.title}</p>
                        <table className="w-full text-xs tabular-nums">
                          <thead className="text-left text-[color:var(--muted)]">
                            <tr>
                              <th className="py-1 font-medium" />
                              <th className="py-1 text-right font-medium">Angeschr.</th>
                              <th className="py-1 text-right font-medium">Antw.</th>
                              <th className="py-1 text-right font-medium">Abschl.</th>
                              <th className="py-1 text-right font-medium">Provision</th>
                            </tr>
                          </thead>
                          <tbody>
                            {t.rows.map((r) => (
                              <tr key={r.key} className="border-t border-[color:var(--border)]">
                                <td className="py-1 pr-2">{r.label}</td>
                                <td className="py-1 text-right">{de(r.angeschrieben)}</td>
                                <td className="py-1 text-right">{(quote(r.geantwortet, r.angeschrieben) ?? 0).toLocaleString("de-DE")} %</td>
                                <td className="py-1 text-right">{de(r.abschluss)}</td>
                                <td className="py-1 text-right">{eurRound(r.provision)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </Card>
          ) : null}

          <Card id="kunden" className="scroll-mt-20" menus>
            <CardHeader title="Kunden" icon={Users} count={total} />
            <div className="space-y-3 px-5 py-3">
              <KundenSuche withSort={premiumSum > 0} />
              <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 text-sm" aria-label="Kunden filtern" data-bestand-filter>
                {FILTERS.map((f) => {
                  const sp = new URLSearchParams({ ...(q ? { q } : {}), ...(byValue ? { sort: "beitrag" } : {}), ...(f.key !== "alle" ? { filter: f.key } : {}) });
                  const active = f.key === filter;
                  return (
                    <Link
                      key={f.key}
                      href={`/buyer/bestand${sp.size ? `?${sp}` : ""}#kunden`}
                      scroll={false}
                      aria-current={active ? "true" : undefined}
                      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 sm:min-h-8 ${active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold" : "border-[color:var(--border)] bg-white"}`}
                      data-bestand-filter-chip={f.key}
                    >
                      {f.label}
                      <span className="tabular-nums text-[color:var(--muted)]">{de(filterCounts[f.key] ?? 0)}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <ul className="divide-y divide-[color:var(--border)]" data-bestand-list>
              {list.map((e) => {
                const person = [e.firstName, e.lastName].filter(Boolean).join(" ");
                const title = displayName(e);
                // Zweite Zeile: Firma (bzw. E-Mail, wenn die Firma schon als Name steht)
                const second = person ? e.company : e.company ? e.email : null;
                // Sparten wie überall in der App schreiben („Kfz“ statt „KFZ“)
                const lines = e.lines.map((l) => (l === "KFZ" ? "Kfz" : l));
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm" data-bestand-row>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium" title={title}>
                          {title}
                        </span>
                        {e.blockedAt ? (
                          <span className="shrink-0 text-xs text-rose-700" data-bestand-blocked>
                            gesperrt
                          </span>
                        ) : e.optOutAt ? (
                          <span className="shrink-0 text-xs text-rose-700">abgemeldet</span>
                        ) : null}
                        {!e.optOutAt && !e.blockedAt ? (
                          <span className="hidden sm:inline-flex">
                            <ConsentBadges
                              email={(e.emailConsent as "ja" | "nein" | null) ?? null}
                              whatsapp={(e.whatsappConsent as "ja" | "nein" | null) ?? null}
                              emailOptOut={!!e.emailOptOutAt}
                              uwg={consentSettings.uwgConfirmed && e.widerspruchHinweis === "ja"}
                            />
                          </span>
                        ) : null}
                      </div>
                      {second || lines.length ? (
                        <div className="truncate text-xs text-[color:var(--muted)]" title={[second, lines.join(", ")].filter(Boolean).join(" · ")}>
                          {second}
                          {lines.length ? (
                            <span className="md:hidden">
                              {second ? " · " : ""}
                              {lines.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span className="hidden max-w-[14rem] shrink-0 flex-wrap justify-end gap-1 md:flex">
                      {lines.map((l) => (
                        <span key={l} className="rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] px-2 py-0.5 text-xs">
                          {l}
                        </span>
                      ))}
                    </span>
                    {e.premiumTotal != null ? <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums sm:block">{eurRound(Number(e.premiumTotal))}</span> : null}
                    <span className="hidden w-32 shrink-0 truncate text-right text-xs text-[color:var(--muted)] sm:block">{e.phone ? `+${e.phone}` : "keine Mobilnummer"}</span>
                    {withMails.has(e.id) ? <BestandMailVerlauf existingCustomerId={e.id} name={title} /> : null}
                    <KundeAktionen
                      consent={{
                        existingCustomerId: e.id,
                        name: title,
                        email: (e.emailConsent as "ja" | "nein" | null) ?? null,
                        whatsapp: (e.whatsappConsent as "ja" | "nein" | null) ?? null,
                        hinweis: (e.widerspruchHinweis as "ja" | "nein" | null) ?? null,
                        mailAllowed: consentRequestByMailAllowed(subjectOf(e, suppression), consentSettings),
                        waWindowOpen: !!e.phone && waOpen.has(e.phone),
                        readOnly: ctx.preview,
                      }}
                      // Beschrifteter Knopf nur im Filter „Ohne Einwilligung“ (sonst eine Wand gleicher Knöpfe), sonst im Menü
                      needsConsent={filter === "ohne" && !e.optOutAt && !e.blockedAt && !reachableForOffers(subjectOf(e, suppression)) && (!!e.email || !!e.phone)}
                      hasPhone={!!e.phone}
                      referral={c.empfehlungEnabled && !e.optOutAt && !e.blockedAt}
                      blocked={!!e.blockedAt}
                    />
                  </li>
                );
              })}
            </ul>
            {!list.length ? (
              <p className="px-5 pb-4 text-sm text-[color:var(--muted)]" data-bestand-no-hits>
                {q ? `Keine Kunden zu „${q}“.` : "Hier ist gerade niemand."}{" "}
                <Link href="/buyer/bestand#kunden" scroll={false} className="font-medium text-[color:var(--brand)] hover:underline">
                  Alle anzeigen
                </Link>
              </p>
            ) : list.length >= pageSize && (listTotal == null || listTotal > list.length) ? (
              <div className="px-5 py-3" data-bestand-more>
                <ButtonLink
                  href={`/buyer/bestand?${new URLSearchParams({ ...(q ? { q } : {}), ...(byValue ? { sort: "beitrag" } : {}), ...(filter !== "alle" ? { filter } : {}), n: String(pageSize + LIST_STEP) })}#kunden`}
                  className="w-full sm:w-auto"
                >
                  Mehr laden
                </ButtonLink>
              </div>
            ) : null}
          </Card>

          {/* Mehr: Seltenes und Einstellungen (Kontingent, Pakete, Nachbuchen, Import, Beitragsvolumen) */}
          <Card id="mehr" menus>
            <details className="group [&>summary::-webkit-details-marker]:hidden" open={!!mehr} data-bestand-mehr>
              <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-5 py-3">
                <span className="text-[15px] font-semibold">Mehr: Kontingent, Import, Einstellungen</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
              </summary>
              <div className="space-y-5 border-t border-[color:var(--border)] px-5 py-4 text-sm">
                {!quotaTop ? <QuotaBar quota={quota} booking={booking} waiting={waiting} variant="secondary" /> : null}
                <div data-bestand-settings>
                  <AutoTopUpForm
                    max={autoState.max}
                    spent={autoState.spent}
                    packPrice={PRICE_LIST.bestandPacks[0].price}
                    packMessages={PRICE_LIST.bestandPacks[0].messages}
                    readOnly={ctx.preview}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonLink href="/buyer/bestand/import" icon={Upload}>
                    Liste aktualisieren
                  </ButtonLink>
                  {lastImport && lastImport.removable > 0 ? (
                    <ImportUndoButton
                      readOnly={ctx.preview}
                      run={{ createdAt: lastImport.createdAt.toISOString(), fileName: lastImport.fileName, created: lastImport.created, updated: lastImport.updated, removable: lastImport.removable }}
                    />
                  ) : null}
                  <span className="text-xs text-[color:var(--muted)]">Abgleich über Kundennummer, sonst Telefon oder E-Mail.</span>
                </div>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1" data-bestand-recht-link>
                  <ShieldCheck className="h-4 w-4 text-[color:var(--muted)]" />
                  <Link href="/buyer/bestand/einwilligungen" className="font-medium text-[color:var(--brand)] hover:underline">
                    Einwilligungen &amp; Versand
                  </Link>
                  <span className="text-[color:var(--muted)]">
                    {optOut ? `${de(optOut)} abgemeldet` : "Keine Abmeldungen"}
                    {blocked ? ` · ${de(blocked)} gesperrt` : ""}
                  </span>
                </p>
                {isExclusiveAgent(c.vermittlerTyp) ? (
                  <p className="text-xs text-[color:var(--muted)]" data-bestand-sparten-hint>
                    Vorschläge nur für Sparten, die Sie anbieten (als Ausschließlichkeitsvertreter keine Produkte anderer Versicherer).{" "}
                    <Link href="/buyer/bestand/einwilligungen#sparten" className="underline">
                      Meine Sparten
                    </Link>
                  </p>
                ) : null}
                {premiumSum > 0 ? (
                  <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2" data-bestand-volume>
                    <div>
                      <div className="text-xs text-[color:var(--muted)]">Beitragsvolumen pro Jahr</div>
                      <div className="text-lg font-semibold tabular-nums">{eurRound(premiumSum)}</div>
                      <div className="text-xs text-[color:var(--muted)]">aktive Verträge von {de(volume._count._all)} Kunden</div>
                    </div>
                    {trailRate > 0 ? (
                      <div>
                        <div className="text-xs text-[color:var(--muted)]">≈ Bestandsprovision pro Jahr</div>
                        <div className="text-lg font-semibold tabular-nums">{eurRound(premiumSum * trailRate)}</div>
                        <div className="text-xs text-[color:var(--muted)]">
                          Schätzung mit {(trailRate * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % aus{" "}
                          <Link href="/buyer/provisionen" className="underline">
                            Meine Provisionen
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!c.empfehlungEnabled && EMPFEHLUNG_MODULE_AVAILABLE ? (
                  <p className="flex flex-wrap items-center gap-3" data-bestand-empfehlung-locked>
                    <span className="min-w-0 flex-1 text-[color:var(--muted)]">Einmal im Jahr um eine Empfehlung bitten, mit dem Modul „Empfehlungen &amp; Bewertungen“.</span>
                    <ButtonLink href="/buyer/konto?modul=empfehlung#zusatzmodule">Modul ansehen</ButtonLink>
                  </p>
                ) : null}
              </div>
            </details>
          </Card>
        </div>
      )}
    </main>
  );
}

/** Aufklapper „Warum?“ (Erklärung nur auf Wunsch, Ole: Hinweistexte höchstens ein Satz). */
function Warum({ children }: { children: React.ReactNode }) {
  return (
    <details className="group text-sm [&>summary::-webkit-details-marker]:hidden [&[open]]:basis-full">
      <summary className="inline-flex min-h-10 cursor-pointer items-center gap-1 font-medium text-[color:var(--brand)] sm:min-h-8">
        Warum? <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
      </summary>
      <p className="mt-1 text-[color:var(--muted)]">{children}</p>
    </details>
  );
}

/** Menü „Mehr“ oben rechts: Import, Einwilligungen, Kontingent (ohne JavaScript, als Aufklapper). */
function MehrMenu({ mehrHref }: { mehrHref: string }) {
  const item = "flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-[color:var(--surface-sunken)]";
  return (
    <details className="relative [&>summary::-webkit-details-marker]:hidden" data-bestand-mehr-menu>
      <summary className={buttonClass("secondary", "sm", "cursor-pointer list-none")} aria-label="Mehr">
        <MoreHorizontal className="h-3.5 w-3.5" />
        Mehr
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 w-60 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white py-1 text-sm shadow-[var(--shadow-lg)]">
        <Link href="/buyer/bestand/import" className={item}>
          <Upload className="h-4 w-4 text-[color:var(--muted)]" /> Liste aktualisieren
        </Link>
        <Link href="/buyer/bestand/einwilligungen" className={item}>
          <ShieldCheck className="h-4 w-4 text-[color:var(--muted)]" /> Einwilligungen &amp; Versand
        </Link>
        <Link href={mehrHref} className={item}>
          <PackagePlus className="h-4 w-4 text-[color:var(--muted)]" /> Kontingent und Pakete
        </Link>
      </div>
    </details>
  );
}

/** Genau eine Aktion je Zustand: läuft → Pausieren, pausiert → Fortsetzen bzw. Paket buchen, Entwurf → Starten, fertig → Ergebnis. */
function CampaignAction({ id, status, quotaStop, booking, readOnly }: { id: string; status: string; quotaStop: boolean; booking: PackBooking; readOnly: boolean }) {
  if (status === "done") {
    return (
      <ButtonLink href={`/buyer/bestand/kampagnen/${id}`} variant="ghost">
        Ergebnis
      </ButtonLink>
    );
  }
  if (quotaStop) return <PackBookButton {...booking} label="Paket buchen" variant="secondary" />;
  if (status === "draft") {
    return (
      <span className="flex items-center gap-1">
        <form action={toggleCampaignAction}>
          <input type="hidden" name="id" value={id} />
          <button className={buttonClass("secondary", "sm")} disabled={readOnly}>
            Starten
          </button>
        </form>
        {/* Seltenes ins Menü: Entwurf löschen */}
        <details className="relative [&>summary::-webkit-details-marker]:hidden" data-bestand-draft-menu>
          <summary className="inline-flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]" aria-label="Weitere Aktionen">
            <MoreHorizontal className="h-4 w-4" />
          </summary>
          <form action={deleteDraftCampaignAction} className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white py-1 text-sm shadow-[var(--shadow-lg)]">
            <input type="hidden" name="id" value={id} />
            <button className="flex min-h-11 w-full items-center px-3 text-left text-rose-700 hover:bg-[color:var(--surface-sunken)] disabled:opacity-50" disabled={readOnly}>
              Entwurf löschen
            </button>
          </form>
        </details>
      </span>
    );
  }
  return (
    <form action={toggleCampaignAction}>
      <input type="hidden" name="id" value={id} />
      <button className={buttonClass(status === "running" ? "ghost" : "secondary", "sm")} disabled={readOnly}>
        {status === "running" ? "Pausieren" : "Fortsetzen"}
      </button>
    </form>
  );
}

function LockedBestand({
  requestedAt,
  readOnly,
  canBook,
  reason,
  annual,
  prepayMonths,
  freeMonths,
}: {
  requestedAt: string | null;
  readOnly: boolean;
  canBook: boolean;
  reason: string | null;
  annual: boolean;
  prepayMonths: number;
  /** Freimonate des Kunden (Customer.prepayFreeMonths); null = Standard */
  freeMonths: number | null;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8" data-bestand-locked>
      <PageHeader title="Bestand" subtitle="Ihre Bestandskunden gezielt ansprechen" />
      <Card>
        <CardHeader title="Bestandskunden-Modul" icon={Users} />
        <div className="space-y-4 px-5 pb-5 pt-4 text-[15px]">
          <h2 className="text-xl font-semibold leading-snug tracking-tight">Geschäft im eigenen Bestand finden</h2>
          <p className="-mt-2">
            Die App zeigt, wem ein Angebot fehlt (z. B. Kfz ohne Hausrat), und schreibt die passenden Kunden mit einem Klick an. Antworten landen als Lead in
            Ihrer Pipeline.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
            <li>
              {eur(PRICE_LIST.bestandModuleMonthly)} netto im Monat,{" "}
              {annual
                ? prepayMonths === 6
                  ? "bei Ihrer Vorauszahlung kündbar zum Ende der bezahlten 6 Monate"
                  : "bei Ihrer jährlichen Vorauszahlung kündbar zum Ende des bezahlten Jahres"
                : "monatlich kündbar"}
            </li>
            <li>WhatsApp-Gebühren für bis zu {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat inklusive</li>
            <li>Bis zu {PRICE_LIST.bestandIncludedEmails.toLocaleString("de-DE")} Kampagnen-E-Mails im Monat über Ihr eigenes Postfach inklusive</li>
            <li>Mehr Nachrichten jederzeit als Zusatzpaket: {bestandPacksText()}</li>
            <li>Gesundheitsdaten werden nie übernommen</li>
          </ul>
          {canBook ? (
            <p className="text-sm text-[color:var(--muted)]">Sofort nutzbar, Sie buchen es hier selbst, anteilig ab heute.</p>
          ) : null}
          <ModuleBookButton
            monthlyNet={PRICE_LIST.bestandModuleMonthly}
            includedMessages={PRICE_LIST.bestandIncludedMessages}
            canBook={canBook}
            reason={reason}
            requestedAt={requestedAt}
            readOnly={readOnly}
            annual={annual}
            freeMonths={freeMonths ?? (prepayMonths === 6 ? PRICE_LIST.halfYearFreeMonths : PRICE_LIST.annualFreeMonths)}
            prepayMonths={prepayMonths}
          />
        </div>
      </Card>
    </main>
  );
}
