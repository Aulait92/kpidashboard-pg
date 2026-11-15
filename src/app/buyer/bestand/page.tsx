import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, Lightbulb, Megaphone, ShieldCheck, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, ButtonLink, Card, CardHeader, EmptyState } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { OCCASIONS, opportunities, type Occasion } from "@/lib/bestand/campaigns";
import { toggleCampaignAction } from "./actions";
import { bestandQuota, QUOTA_PAUSE } from "@/lib/bestand/quota";
import { PRICE_LIST, bestandPacksText, eur } from "@/lib/offer-pricing";
import { displayName } from "@/lib/bestand/rows";
import { lastUndoableImport } from "@/lib/bestand/import";
import { autoTopUpState, packPurchaseBlocker } from "@/lib/bestand/packs";
import { QuotaBar, QuotaLowNotice, type PackBooking } from "@/components/bestand/quota-bar";
import { AutoTopUpForm } from "@/components/bestand/packs";
import { CustomerRowActions } from "@/components/bestand/customer-actions";
import { ImportUndoButton } from "@/components/bestand/import-undo";
import { ModuleBookButton } from "@/components/bestand/module-book";
import { canSelfBookBestand } from "@/lib/bestand/self-service";
import { loadCustomerProvision } from "@/lib/provision-server";
import { potentialHint } from "@/lib/bestand/campaigns";
import { groupStats, loadCampaignStats, loadPeriodTiles, quote } from "@/lib/bestand/statistik";
import { loadConsentSettings, loadSuppression, subjectOf } from "@/lib/bestand/einwilligung-server";
import { consentRequestByMailAllowed } from "@/lib/bestand/einwilligung";
import { ConsentBadges, ConsentRowAction } from "@/components/bestand/consent-actions";
import { isExclusiveAgent } from "@/lib/bestand/befugnis";
import { loadCustomerContracts } from "@/lib/vertraege";
import { EMPFEHLUNG_MODULE_AVAILABLE } from "@/lib/empfehlung/shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bestand | performancegrowth" };

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  running: { label: "läuft", tone: "success" },
  paused: { label: "pausiert", tone: "warning" },
  done: { label: "fertig", tone: "neutral" },
  draft: { label: "Entwurf", tone: "neutral" },
};

const eurRound = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const PERIODS = [30, 90, 365] as const;

/** „Lücke schließen: KFZ ohne Hausrat“, ohne Doppelung, wenn der Name der Anlass ist. */
function campaignTitle(occasion: string, name: string): string {
  const label = OCCASIONS[occasion as Occasion]?.label ?? occasion;
  return name === label ? label : `${label}: ${name}`;
}

export default async function BestandPage({ searchParams }: { searchParams: Promise<{ q?: string; gestartet?: string; kontingent?: string; sort?: string; tage?: string }> }) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const c = await prisma.customer.findUnique({
    where: { id: ctx.customerId },
    select: { existingCustomersEnabled: true, bestandRequestedAt: true, bestandCancelAt: true, billingInterval: true, empfehlungEnabled: true, vermittlerTyp: true },
  });
  if (!c) redirect("/buyer");
  // Ohne gebuchtes Modul: freundlicher Hinweis statt Sperre ohne Erklärung
  if (!c.existingCustomersEnabled) {
    const check = await canSelfBookBestand(ctx.customerId);
    return (
      <LockedBestand
        requestedAt={c.bestandRequestedAt?.toISOString() ?? null}
        readOnly={ctx.preview}
        canBook={check.ok}
        reason={check.ok ? null : check.reason}
        annual={c.billingInterval === "year"}
      />
    );
  }
  const { q = "", gestartet, kontingent, sort, tage } = await searchParams;
  const days = PERIODS.find((d) => String(d) === tage) ?? 90;
  const byValue = sort === "beitrag";
  const customerId = ctx.customerId;
  const [quota, packBlocker, autoState, lastImport] = await Promise.all([
    bestandQuota(customerId),
    packPurchaseBlocker(customerId),
    autoTopUpState(customerId),
    lastUndoableImport(customerId),
  ]);
  const booking: PackBooking = {
    packs: PRICE_LIST.bestandPacks,
    months: PRICE_LIST.bestandPackMonths,
    individualFrom: PRICE_LIST.bestandPackIndividualFrom,
    readOnly: ctx.preview,
    blocker: packBlocker,
  };

  const now = new Date();
  const [total, withPhone, withEmail, optOut, volume, provision, consentSettings, suppression, legacy, noProof] = await Promise.all([
    prisma.existingCustomer.count({ where: { customerId } }),
    // WhatsApp nur mit Opt-in (Ole, 14.11.2026)
    prisma.existingCustomer.count({ where: { customerId, phone: { not: null }, optOutAt: null, whatsappConsent: "ja" } }),
    prisma.existingCustomer.count({ where: { customerId, email: { not: null }, optOutAt: null, emailOptOutAt: null, NOT: { emailConsent: "nein" } } }),
    prisma.existingCustomer.count({ where: { customerId, optOutAt: { not: null } } }),
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
  // Statistik (Ole, 14.11.2026): Kacheln für den Zeitraum, alle Kampagnen mit Zahlen, Vergleich nach Anlass und Thema
  const contracts = total ? await loadCustomerContracts(customerId).catch(() => []) : [];
  const [stats, tiles, potential, opps] = total
    ? await Promise.all([
        loadCampaignStats(customerId, { contracts, rates: provision.rates }),
        loadPeriodTiles(customerId, { from: new Date(now.getTime() - days * 86_400_000), to: now }),
        potentialHint(customerId, now),
        opportunities(customerId, now),
      ])
    : [[], null, null, []];
  const byOccasion = groupStats(stats, "occasion", (k) => OCCASIONS[k as Occasion]?.label ?? k);
  const byTopic = groupStats(stats, "topic", (k) => k);
  const de = (n: number) => n.toLocaleString("de-DE");
  const eurFull = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const qDigits = q.replace(/\D/g, "");
  const list = total
    ? await prisma.existingCustomer.findMany({
        where: {
          customerId,
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
          : [{ lastName: { sort: "asc", nulls: "last" } }, { firstName: "asc" }, { company: { sort: "asc", nulls: "last" } }, { email: "asc" }],
        take: 50,
      })
    : [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Bestand"
        subtitle={
          total
            ? `${total.toLocaleString("de-DE")} Kunden · ${withPhone.toLocaleString("de-DE")} mit WhatsApp-Einwilligung · ${withEmail.toLocaleString("de-DE")} mit E-Mail${optOut ? ` · ${optOut} gesperrt` : ""}`
            : "Ihre Bestandskunden gezielt ansprechen"
        }
        actions={
          <ButtonLink href="/buyer/bestand/import" variant={total ? "secondary" : "primary"} icon={Upload}>
            {total ? "Liste aktualisieren" : "Kunden importieren"}
          </ButtonLink>
        }
      />
      {kontingent && quota.remaining <= 0 ? (
        <p className="mb-2 text-sm font-medium text-amber-900" data-quota-reached>
          Für eine neue Kampagne ist diesen Monat nichts mehr frei.
        </p>
      ) : null}
      <QuotaBar quota={quota} booking={booking} />
      {c.bestandCancelAt ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-bestand-cancel-notice>
          Das Modul ist zum {c.bestandCancelAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} gekündigt. Bis dahin können Sie es wie gewohnt
          nutzen.{" "}
          <Link href="/buyer/konto" className="font-medium underline">
            Kündigung zurücknehmen
          </Link>
        </div>
      ) : null}
      {total && ((legacy > 0 && !consentSettings.legacyReviewedAt) || !consentSettings.uwgConfirmed || noProof > 0) ? (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-bestand-consent-notice>
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {legacy > 0 && !consentSettings.legacyReviewedAt
              ? `Bitte prüfen: Für ${legacy.toLocaleString("de-DE")} Kunden gilt die Einwilligung aus Ihrer pauschalen Bestätigung beim Import („laut Versicherer“) für WhatsApp und E-Mail.`
              : !consentSettings.uwgConfirmed
                ? "Ohne Einwilligung gehen E-Mails nur nach § 7 Abs. 3 UWG raus. Dafür fehlt noch Ihre Bestätigung."
                : `${noProof.toLocaleString("de-DE")} Kunden ohne Nachweis zum Hinweis auf das Widerspruchsrecht: E-Mails an sie gehen nur mit Einwilligung.`}
          </span>
          <ButtonLink href="/buyer/bestand/einwilligungen" variant="primary">
            Einwilligungen prüfen
          </ButtonLink>
        </div>
      ) : null}
      {gestartet ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Kampagne gestartet. Nachrichten gehen Mo–Sa zwischen 9 und 19 Uhr schrittweise raus. Antworten landen als Lead in der Pipeline.
        </div>
      ) : null}

      {!total ? (
        <Card>
          <EmptyState
            icon={Users}
            title="Noch keine Bestandskunden"
            text="Exportieren Sie Ihre Kundenliste als Excel oder CSV aus dem Bestandssystem und laden Sie sie hier hoch. Danach zeigen wir Ihnen, wo die größten Chancen liegen."
            action={<ButtonLink href="/buyer/bestand/import" variant="primary" icon={Upload}>Kunden importieren</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {premiumSum > 0 ? (
            <Card>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 px-5 py-4" data-bestand-volume>
                <div>
                  <div className="text-sm text-[color:var(--muted)]">Beitragsvolumen pro Jahr</div>
                  <div className="text-2xl font-semibold tabular-nums">{eurRound(premiumSum)}</div>
                  <div className="text-sm text-[color:var(--muted)]">aktive Verträge von {volume._count._all.toLocaleString("de-DE")} Kunden</div>
                </div>
                {trailRate > 0 ? (
                  <div>
                    <div className="text-sm text-[color:var(--muted)]">≈ Bestandsprovision pro Jahr</div>
                    <div className="text-2xl font-semibold tabular-nums">{eurRound(premiumSum * trailRate)}</div>
                    <div className="text-sm text-[color:var(--muted)]">
                      Schätzung mit {(trailRate * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} % aus{" "}
                      <Link href="/buyer/provisionen" className="underline">
                        Meine Provisionen
                      </Link>{" "}
                      für alle Sparten
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}
          <Card>
            <CardHeader title="Chancen" icon={Lightbulb} />
            <ul className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
              {opps.map((o) => {
                const params = new URLSearchParams({ anlass: o.occasion, segment: JSON.stringify(o.segment), ...(o.topic ? { thema: o.topic } : {}) });
                return (
                  <li key={o.title} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-2xl font-semibold tabular-nums">{o.count.toLocaleString("de-DE")}</div>
                      <div className="text-sm text-[color:var(--muted)]">{o.title}</div>
                      <div className="text-xs text-[color:var(--muted)]" data-opp-channels>
                        {o.whatsapp ? `${de(o.whatsapp)} WhatsApp` : ""}
                        {o.whatsapp && o.email ? " · " : ""}
                        {o.email ? `${de(o.email)} E-Mail` : ""}
                      </div>
                    </div>
                    <ButtonLink href={`/buyer/bestand/kampagne?${params.toString()}`} variant="primary">
                      Ansprechen
                    </ButtonLink>
                  </li>
                );
              })}
              {!opps.length ? (
                <li className="text-sm text-[color:var(--muted)]">
                  Gerade keine erreichbaren Kunden (alle kürzlich angeschrieben, ohne Einwilligung oder ohne Kontaktdaten).{" "}
                  <Link href="/buyer/bestand/einwilligungen" className="underline">
                    Einwilligungen &amp; Versand
                  </Link>
                </li>
              ) : null}
              {isExclusiveAgent(c.vermittlerTyp) ? (
                <li className="text-xs text-[color:var(--muted)] sm:col-span-2" data-bestand-sparten-hint>
                  „Lücke schließen“ schlagen wir nur für Sparten vor, die Sie anbieten (als Ausschließlichkeitsvertreter keine Produkte anderer Versicherer).{" "}
                  <Link href="/buyer/bestand/einwilligungen#sparten" className="underline">
                    Meine Sparten
                  </Link>
                </li>
              ) : null}
              {!c.empfehlungEnabled && EMPFEHLUNG_MODULE_AVAILABLE ? (
                <li className="flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-strong)] p-4 sm:col-span-2" data-bestand-empfehlung-locked>
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="font-semibold">Jährliche Empfehlungsbitte</div>
                    <div className="text-[color:var(--muted)]">Zufriedene Bestandskunden mit persönlichem Link um eine Empfehlung bitten, mit dem Modul „Empfehlungen &amp; Bewertungen“.</div>
                  </div>
                  <ButtonLink href="/buyer/konto?modul=empfehlung#zusatzmodule">Modul ansehen</ButtonLink>
                </li>
              ) : null}
            </ul>
          </Card>

          {potential ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] px-4 py-3 text-sm" data-bestand-potential>
              <Lightbulb className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
              <span className="min-w-0 flex-1 font-medium">{potential.title}</span>
              <ButtonLink
                href={`/buyer/bestand/kampagne?${new URLSearchParams({ anlass: "cross_sell", segment: JSON.stringify(potential.segment), thema: potential.topic })}`}
                variant="primary"
              >
                Kampagne starten
              </ButtonLink>
            </div>
          ) : null}

          {stats.length && tiles ? (
            <Card>
              <CardHeader title="Ergebnisse der Kampagnen" icon={BarChart3} />
              <div className="px-5 pb-5" data-bestand-stats>
                <div className="mb-3 flex flex-wrap gap-2 text-sm" data-bestand-period>
                  {PERIODS.map((d) => (
                    <Link
                      key={d}
                      href={`/buyer/bestand?tage=${d}`}
                      aria-current={d === days ? "true" : undefined}
                      className={`rounded-full border px-3 py-1 ${d === days ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold" : "border-[color:var(--border)]"}`}
                    >
                      {d === 365 ? "12 Monate" : `${d} Tage`}
                    </Link>
                  ))}
                </div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-bestand-tiles>
                  {[
                    { label: "Angeschrieben", value: de(tiles.funnel.gesamt.angeschrieben), sub: `${de(tiles.funnel.whatsapp.angeschrieben)} WhatsApp · ${de(tiles.funnel.email.angeschrieben)} E-Mail` },
                    {
                      label: "Antwortquote",
                      value: `${(quote(tiles.funnel.gesamt.geantwortet, tiles.funnel.gesamt.angeschrieben) ?? 0).toLocaleString("de-DE")} %`,
                      sub: `WhatsApp ${(quote(tiles.funnel.whatsapp.geantwortet, tiles.funnel.whatsapp.angeschrieben) ?? 0).toLocaleString("de-DE")} % · E-Mail ${(quote(tiles.funnel.email.geantwortet, tiles.funnel.email.angeschrieben) ?? 0).toLocaleString("de-DE")} %`,
                    },
                    { label: "Termine", value: de(tiles.funnel.gesamt.termin), sub: `${de(tiles.funnel.whatsapp.termin)} WhatsApp · ${de(tiles.funnel.email.termin)} E-Mail` },
                    { label: "Abschlüsse", value: de(tiles.funnel.gesamt.abschluss), sub: `${de(tiles.funnel.whatsapp.abschluss)} WhatsApp · ${de(tiles.funnel.email.abschluss)} E-Mail` },
                    { label: "Provision", value: eurFull(tiles.funnel.gesamt.provision), sub: tiles.funnel.gesamt.bestandProJahr > 0 ? `+ ${eurFull(tiles.funnel.gesamt.bestandProJahr)} Bestand pro Jahr` : "1. Jahr" },
                  ].map((t) => (
                    <div key={t.label} className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2.5">
                      <dt className="text-xs text-[color:var(--muted)]">{t.label}</dt>
                      <dd className="text-xl font-semibold tabular-nums">{t.value}</dd>
                      <dd className="text-[11px] text-[color:var(--muted)]">{t.sub}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-xs text-[color:var(--muted)]">
                  Abschlüsse zählen, wenn sie innerhalb von 60 Tagen nach dem Anschreiben kommen (bei mehreren Kampagnen die letzte). Provision mit Ihren Sätzen je
                  Sparte, Empfehlungen zählen nicht doppelt.
                </p>
              </div>
            </Card>
          ) : null}

          {stats.length ? (
            <Card>
              <CardHeader title="Kampagnen" icon={Megaphone} count={stats.length} />
              <ul className="divide-y divide-[color:var(--border)]" data-bestand-campaigns>
                {stats.map((k) => {
                  const g = k.funnel.gesamt;
                  return (
                    <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`/buyer/bestand/kampagnen/${k.id}`} className="font-medium hover:underline">
                          {campaignTitle(k.occasion, k.name)}
                        </Link>
                        <div className="text-xs text-[color:var(--muted)]">
                          {de(g.angeschrieben)} angeschrieben
                          {k.funnel.email.angeschrieben ? ` (${de(k.funnel.whatsapp.angeschrieben)} WhatsApp, ${de(k.funnel.email.angeschrieben)} E-Mail)` : ""} · {de(g.geantwortet)} Antworten ·{" "}
                          {de(g.termin)} Termine · {de(g.abschluss)} Abschlüsse · {eurFull(g.provision)}
                          {g.wartend ? ` · ${de(g.wartend)} warten` : ""}
                        </div>
                      </div>
                      <Badge tone={STATUS[k.status]?.tone ?? "neutral"}>{STATUS[k.status]?.label ?? k.status}</Badge>
                      {k.status === "running" || k.status === "paused" ? (
                        <form action={toggleCampaignAction}>
                          <input type="hidden" name="id" value={k.id} />
                          <button className="text-xs font-medium text-[color:var(--brand)] hover:underline">{k.status === "running" ? "Pausieren" : "Fortsetzen"}</button>
                        </form>
                      ) : null}
                      {k.status === "paused" && k.pausedReason === QUOTA_PAUSE ? (
                        <div className="w-full" data-campaign-quota-paused>
                          <QuotaLowNotice quota={quota} booking={booking} paused />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {stats.length > 1 ? (
                <div className="grid gap-4 border-t border-[color:var(--border)] px-5 py-4 text-sm sm:grid-cols-2" data-bestand-compare>
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
                              <td className="py-1 text-right">{eurFull(r.provision)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-sm" data-bestand-recht-link>
            <ShieldCheck className="h-4 w-4 text-[color:var(--muted)]" />
            <Link href="/buyer/bestand/einwilligungen" className="font-medium text-[color:var(--brand)] hover:underline">
              Einwilligungen &amp; Versand
            </Link>
            <span className="text-[color:var(--muted)]">Wer per WhatsApp bzw. E-Mail angeschrieben werden darf, Pflichtangaben, Abmeldungen</span>
          </div>

          <Card>
            <CardHeader title="Kunden" icon={Users} count={total} />
            <form className="flex flex-wrap gap-2 px-5 pb-3">
              <input name="q" defaultValue={q} placeholder="Name, Telefon, E-Mail oder Kundennummer" className="h-10 min-w-0 flex-1 rounded-full border border-[color:var(--border)] bg-white px-4 text-sm outline-none focus:border-[color:var(--brand)]" />
              {premiumSum > 0 ? (
                <select name="sort" defaultValue={byValue ? "beitrag" : ""} aria-label="Sortierung" className="h-10 rounded-full border border-[color:var(--border)] bg-white px-3 text-sm">
                  <option value="">Nach Name</option>
                  <option value="beitrag">Nach Jahresbeitrag</option>
                </select>
              ) : null}
              {premiumSum > 0 ? (
                <button type="submit" className="h-10 rounded-full border border-[color:var(--border)] bg-white px-4 text-sm font-medium">
                  Anzeigen
                </button>
              ) : null}
            </form>
            <ul className="divide-y divide-[color:var(--border)]" data-bestand-list>
              {list.map((e) => {
                const person = [e.firstName, e.lastName].filter(Boolean).join(" ");
                const title = displayName(e);
                // Zweite Zeile: Firma (bzw. E-Mail, wenn die Firma schon als Name steht)
                const second = person ? e.company : e.company ? e.email : null;
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm" data-bestand-row>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium" title={title}>
                          {title}
                        </span>
                        {e.optOutAt ? <span className="shrink-0 text-xs text-rose-700">gesperrt</span> : null}
                        {!e.optOutAt ? (
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
                      {second || e.lines.length ? (
                        <div className="truncate text-xs text-[color:var(--muted)]" title={[second, e.lines.join(", ")].filter(Boolean).join(" · ")}>
                          {second}
                          {e.lines.length ? (
                            <span className="md:hidden">
                              {second ? " · " : ""}
                              {e.lines.join(", ")}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <span className="hidden max-w-[14rem] shrink-0 flex-wrap justify-end gap-1 md:flex">
                      {e.lines.map((l) => (
                        <span key={l} className="rounded-full bg-[color:var(--surface-sunken,#f1f5f9)] px-2 py-0.5 text-xs">
                          {l}
                        </span>
                      ))}
                    </span>
                    {e.premiumTotal != null ? <span className="hidden w-20 shrink-0 text-right text-sm tabular-nums sm:block">{eurRound(Number(e.premiumTotal))}</span> : null}
                    <span className="hidden w-32 shrink-0 truncate text-right text-xs text-[color:var(--muted)] sm:block">{e.phone ? `+${e.phone}` : "keine Mobilnummer"}</span>
                    <ConsentRowAction
                      existingCustomerId={e.id}
                      name={title}
                      email={(e.emailConsent as "ja" | "nein" | null) ?? null}
                      whatsapp={(e.whatsappConsent as "ja" | "nein" | null) ?? null}
                      hinweis={(e.widerspruchHinweis as "ja" | "nein" | null) ?? null}
                      mailAllowed={consentRequestByMailAllowed(subjectOf(e, suppression), consentSettings)}
                      readOnly={ctx.preview}
                    />
                    {c.empfehlungEnabled && !e.optOutAt ? <CustomerRowActions existingCustomerId={e.id} name={title} hasPhone={!!e.phone} readOnly={ctx.preview} /> : null}
                  </li>
                );
              })}
            </ul>
            {total > list.length ? <p className="px-5 py-3 text-xs text-[color:var(--muted)]">Erste {list.length} von {total.toLocaleString("de-DE")}, Suche nutzen.</p> : null}
          </Card>
          <Card>
            <div className="px-5 py-4" data-bestand-settings>
              <AutoTopUpForm
                max={autoState.max}
                spent={autoState.spent}
                packPrice={PRICE_LIST.bestandPacks[0].price}
                packMessages={PRICE_LIST.bestandPacks[0].messages}
                readOnly={ctx.preview}
              />
            </div>
          </Card>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
            <p className="min-w-0 flex-1">
              <Link href="/buyer/bestand/import" className="underline">
                Liste erneut hochladen
              </Link>{" "}
              aktualisiert vorhandene Kunden (Abgleich über Kundennummer, sonst Telefon/E-Mail).
            </p>
            {lastImport && lastImport.removable > 0 ? (
              <ImportUndoButton
                readOnly={ctx.preview}
                run={{ createdAt: lastImport.createdAt.toISOString(), fileName: lastImport.fileName, created: lastImport.created, updated: lastImport.updated, removable: lastImport.removable }}
              />
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
}

function LockedBestand({ requestedAt, readOnly, canBook, reason, annual }: { requestedAt: string | null; readOnly: boolean; canBook: boolean; reason: string | null; annual: boolean }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8" data-bestand-locked>
      <PageHeader title="Bestand" subtitle="Ihre Bestandskunden gezielt ansprechen" />
      <Card>
        <CardHeader title="Bestandskunden-Modul" icon={Users} />
        <div className="space-y-4 px-5 pb-5 pt-4 text-[15px]">
          <p>
            Laden Sie Ihre Kundenliste hoch, und die App zeigt Ihnen, wo Geschäft liegt: Lücken (z. B. KFZ ohne Hausrat), Jahresgespräche,
            Geburtstage und auslaufende Verträge. Mit einem Klick schreiben Sie die passenden Kunden per WhatsApp oder E-Mail an, Antworten landen als
            Lead in Ihrer Pipeline.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--muted)]">
            <li>
              {eur(PRICE_LIST.bestandModuleMonthly)} netto im Monat,{" "}
              {annual ? "bei Ihrer jährlichen Vorauszahlung kündbar zum Ende des bezahlten Jahres" : "monatlich kündbar"}
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
            freeMonths={PRICE_LIST.annualFreeMonths}
          />
        </div>
      </Card>
    </main>
  );
}
