import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Check, ChevronDown, ClipboardList, MessageSquareHeart, Phone, QrCode, Star } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { moduleInfo } from "@/lib/empfehlung/module";
import { empfehlungVisible } from "@/lib/empfehlung/shared";
import { generalLinkOf, loadEmpfehlungStats, loadReferralCandidates, loadSettings, openCritiques, openRewards, recentRequests, referralLinkFor } from "@/lib/empfehlung/requests";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { personFromCustomerName } from "@/lib/advisor-name";
import { FEEDBACK_CONSENT_LABEL, HEUTE_VISIBLE, OFFER_PRESETS, fmtDate, fmtHours, resolveOffer, signatureLine } from "@/lib/empfehlung/shared";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { EmpfehlungFunnel, EmpfehlungFunnelLine, EmpfehlungWert } from "@/components/empfehlung/server";
import { WaechterSection } from "@/components/empfehlung/waechter";
import { ConsentButton, CopyText, EmpfehlungBookButton, GoogleUrlQuickForm, HeuteFragenList, QrIconButton, ResolveButton, RewardButtons, SettingsForm, TestSendForm } from "@/components/empfehlung/client";
import { buttonClass } from "@/components/ui";
import { resumeAction } from "./actions";
import { after } from "next/server";
import { needsSubmit, templateNotice } from "@/lib/whatsapp/vorlagen-hinweis";

// Modul „Empfehlungen & Bewertungen“ (Paket 2, 19.11.2026): Arbeitsliste statt Kennzahlen-Raster.
// Übersicht: Wert-Zeile, „Heute fragen“ (einzige Hauptaktion: „Link senden“), „Zu erledigen“, eine Trichter-Zeile.
// Teilen: QR-Code und allgemeiner Link, Signatur, Bewertungs-Wächter. Einstellungen: Automatik, Google-Link, Angebot,
// Rest unter „Erweitert“. Erklärungen und Rechtliches stehen in docs/hilfe.md.
export const dynamic = "force-dynamic";
export const metadata = { title: "Empfehlungen & Bewertungen | performancegrowth" };

const STATUS: Record<string, string> = {
  scheduled: "geplant",
  sending: "wird gesendet",
  sent: "gesendet",
  answered: "beantwortet",
  skipped: "übersprungen",
  failed: "fehlgeschlagen",
  off: "nicht anfragen",
};
const SENTIMENT: Record<string, { text: string; tone: "success" | "danger" | "info" }> = {
  positive: { text: "Lob", tone: "success" },
  negative: { text: "Kritik", tone: "danger" },
  neutral: { text: "Frage", tone: "info" },
};
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export default async function EmpfehlungenPage({ searchParams }: { searchParams: Promise<{ google?: string; tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "einstellungen" || sp.tab === "teilen" ? sp.tab : sp.google ? "teilen" : "uebersicht";
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole !== "owner") redirect("/buyer");
  const info = await moduleInfo(ctx.customerId);
  if (!info) redirect("/buyer");
  // Modul vorerst nicht verfügbar (lib/empfehlung/shared.ts EMPFEHLUNG_MODULE_AVAILABLE)
  if (!empfehlungVisible(info.active)) redirect("/buyer");
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, vermittlerTyp: true, whatsAppAccount: { select: { status: true } } } });
  const vertreter = advisorDisplayName(customer?.name ?? "");

  if (!info.active) {
    // Werbeseite (Modul nicht gebucht): eine Hauptaktion „30 Tage kostenlos testen“
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader title="Empfehlungen & Bewertungen" subtitle="Zusatzmodul" />
        <Card>
          <CardHeader title="Aus zufriedenen Kunden neue Abschlüsse" icon={Star} />
          <div className="space-y-4 px-5 pb-5 pt-4 text-sm">
            <p>Die App fragt nach jedem Abschluss in Ihrem Namen nach einer ehrlichen Bewertung und einer Empfehlung. Empfohlene melden sich selbst, Sie rufen nur noch an.</p>
            <ul className="space-y-2">
              {[
                "Zustimmung beim Abschluss mit einem Tipp, danach läuft alles automatisch.",
                "Liste „Heute fragen“: wer gerade bereit für eine Empfehlung ist, mit einem Knopf.",
                "Kritik landet zuerst bei Ihnen, nicht bei Google.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  {t}
                </li>
              ))}
            </ul>
            <EmpfehlungBookButton
              trial={info.trialAvailable}
              annual={info.annual}
              prepayMonths={info.prepayMonths}
              monthly={PRICE_LIST.empfehlungModuleMonthly}
              readOnly={ctx.preview}
              reason={info.service ? "Das Modul gibt es nur im Paket mit Software." : null}
            />
          </div>
        </Card>
      </main>
    );
  }

  const [settings, stats, requests, templates, cands, critiques, rewards, badReviews] = await Promise.all([
    loadSettings(ctx.customerId),
    loadEmpfehlungStats(ctx.customerId, 90),
    recentRequests(ctx.customerId, 10),
    prisma.messageTemplate.findMany({ where: { customerId: ctx.customerId, purpose: { in: ["review_request", "referral_request", "referral_thanks"] } }, select: { purpose: true, status: true } }),
    loadReferralCandidates(ctx.customerId),
    openCritiques(ctx.customerId),
    openRewards(ctx.customerId),
    prisma.googleReview.count({ where: { customerId: ctx.customerId, stars: { lte: 3 }, repliedAt: null, notifiedAt: { not: null } } }),
  ]);
  const offer = resolveOffer(settings, vertreter);
  const waConnected = customer?.whatsAppAccount?.status === "connected";
  const tplPurposes = ["review_request", "referral_request"];
  const tplNotice = templateNotice(waConnected, templates, tplPurposes, "empfehlung");
  // Fehlt eine Vorlage, obwohl die Nummer verbunden ist: gleich einreichen statt Hinweis
  if (needsSubmit(waConnected, templates, tplPurposes) && !ctx.preview) {
    after(async () => {
      const { submitTemplatesAfterModule } = await import("@/lib/whatsapp/template-submit");
      await submitTemplatesAfterModule(ctx.customerId);
    });
  }
  // Leerer Zustand: noch nichts passiert → Startliste statt Nullwerten
  const empty = requests.length === 0 && stats.referralLeads === 0 && stats.funnel.linksSent === 0 && cands.ready.length === 0;

  // Hinweise mit Knopf, der das Problem direkt löst (Ole, 14.11.2026)
  type Warning = { key: string; text: string; fix?: React.ReactNode };
  const fixLink = (href: string, label: string) => (
    <Link href={href} className={buttonClass("secondary", "md", "shrink-0")}>
      {label}
    </Link>
  );
  const warnings = ([
    !settings.googleReviewUrl && !(empty && tab === "uebersicht")
      ? { key: "google", text: "Google-Bewertungslink fehlt, ohne ihn geht keine Bewertungsbitte raus.", fix: <GoogleUrlQuickForm readOnly={ctx.preview} /> }
      : null,
    // Vorlagen-Hinweis wie auf der Kampagnenseite (lib/whatsapp/vorlagen-hinweis): genau ein Hinweis, nie „melden Sie sich“
    tplNotice?.kind === "connect"
      ? { key: "wa", text: tplNotice.text, fix: fixLink(tplNotice.href, "WhatsApp verbinden") }
      : tplNotice
        ? { key: "tpl", text: tplNotice.text }
        : null,
    !settings.active
      ? {
          key: "paused",
          text: "Automatisches Nachfragen ist pausiert.",
          fix: (
            <form action={resumeAction}>
              <button type="submit" disabled={ctx.preview} className={buttonClass("secondary", "md", "shrink-0")}>
                Wieder einschalten
              </button>
            </form>
          ),
        }
      : null,
  ] as (Warning | null)[]).filter((w): w is Warning => !!w);

  const tabs = [
    { id: "uebersicht", label: "Übersicht" },
    { id: "teilen", label: "Teilen" },
    { id: "einstellungen", label: "Einstellungen" },
  ] as const;

  const heuteItems = cands.ready.map((c) => ({ id: c.id, name: c.name, reasonText: c.reasonText, thema: c.thema, occasion: c.occasion }));
  const todo = critiques.length + (cands.noConsent.length ? 1 : 0) + (badReviews ? 1 : 0) + rewards.length;

  // Teilen: allgemeiner Link als großer QR-Code (in der Admin-Vorschau nichts anlegen)
  let generalUrl: string | null = null;
  let generalQr: string | null = null;
  if (tab === "teilen") {
    const general = ctx.preview ? await prisma.referralLink.findFirst({ where: { customerId: ctx.customerId, kind: "general" } }) : await generalLinkOf(ctx.customerId);
    generalUrl = general ? referralLinkFor(general.token) : null;
    if (generalUrl) {
      const QRCode = (await import("qrcode")).default;
      generalQr = await QRCode.toDataURL(generalUrl, { margin: 1, width: 480 });
    }
  }

  const steps = [
    { key: "google", done: !!settings.googleReviewUrl },
    { key: "angebot", done: settings.offerKind !== "none" },
    { key: "link", done: stats.funnel.linksSent > 0 },
  ];
  const stepsDone = steps.filter((x) => x.done).length;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Empfehlungen & Bewertungen" subtitle={info.state === "trial" && info.trialEndsAt ? `Testphase bis ${fmtDate(info.trialEndsAt)}` : undefined} />
      <nav className="mb-4 border-b border-[color:var(--border)]" aria-label="Bereiche" data-empfehlung-tabs>
        <ul className="-mb-px flex">
          {tabs.map((t) => (
            <li key={t.id} className="flex-1 sm:flex-none">
              <Link
                href={t.id === "uebersicht" ? "/buyer/empfehlungen" : `/buyer/empfehlungen?tab=${t.id}`}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex min-h-11 items-center justify-center whitespace-nowrap border-b-2 px-3 text-[15px] font-semibold transition sm:px-4 ${
                  tab === t.id ? "border-[color:var(--brand)] text-[color:var(--brand)]" : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="space-y-4">
        {warnings.length ? (
          <div className="space-y-2" data-empfehlung-warnings>
            {warnings.map((w) => (
              <div key={w.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-warning={w.key}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 basis-52">{w.text}</span>
                {w.fix}
              </div>
            ))}
          </div>
        ) : null}

        {tab === "uebersicht" && empty ? (
          <Card data-empfehlung-start>
            <CardHeader title="So starten Sie" icon={ClipboardList} actions={<span className="text-sm text-[color:var(--muted)]">{stepsDone} von 3</span>} />
            <div className="h-1 bg-[color:var(--surface-sunken)]" aria-hidden="true">
              <div className="h-1 bg-emerald-500" style={{ width: `${Math.round((stepsDone / 3) * 100)}%` }} />
            </div>
            <ol className="divide-y divide-[color:var(--border)] text-sm">
              <StartStep n={1} done={steps[0].done} title={steps[0].done ? "Google-Bewertungslink hinterlegt" : "Google-Bewertungslink hinterlegen"}>
                {steps[0].done ? null : (
                  <>
                    <GoogleUrlQuickForm readOnly={ctx.preview} primary />
                    <p className="mt-2 text-[color:var(--muted)]">Ohne eigenes Profil? Fragen Sie Ihre Agentur nach dem Bewertungslink.</p>
                  </>
                )}
              </StartStep>
              <StartStep n={2} done={steps[1].done} title={steps[1].done ? `Angebot für Empfohlene: ${settings.offerKind === "custom" ? (settings.offerHeadline ?? "Eigenes Angebot") : OFFER_PRESETS[settings.offerKind as keyof typeof OFFER_PRESETS]?.label ?? "gewählt"}` : "Angebot für Empfohlene wählen"}>
                <Link href="/buyer/empfehlungen?tab=einstellungen" className="font-semibold text-[color:var(--brand)] hover:underline">
                  {steps[1].done ? "Ändern" : "Angebot wählen"}
                </Link>
              </StartStep>
              <StartStep n={3} done={steps[2].done} title="Ersten Empfehlungslink senden">
                <p className="text-[color:var(--muted)]">Nach dem nächsten Abschluss „Kunde hat zugestimmt“ tippen, dann erscheint der Kunde hier.</p>
                <Link href="/buyer/empfehlungen?tab=teilen" className="mt-1 inline-flex min-h-10 items-center gap-1.5 font-semibold text-[color:var(--brand)] hover:underline">
                  <QrCode className="h-4 w-4" /> Oder QR-Code im Termin zeigen
                </Link>
              </StartStep>
            </ol>
          </Card>
        ) : null}

        {tab === "uebersicht" && !empty ? (
          <>
            <Card>
              <div className="p-4 sm:p-5">
                <EmpfehlungWert s={stats} />
              </div>
            </Card>

            <Card className="scroll-mt-20" id="heute-fragen" data-heute-card>
              <CardHeader title="Heute fragen" icon={MessageSquareHeart} count={heuteItems.length || undefined} />
              {heuteItems.length ? (
                <>
                  {stats.valuePerCustomer ? (
                    <p className="px-4 pt-3 text-sm text-[color:var(--muted)] sm:px-5" data-heute-wert>
                      Ein Neukunde bringt Ihnen im Schnitt ca. {eur(stats.valuePerCustomer)} Provision (geschätzt).
                    </p>
                  ) : null}
                  <HeuteFragenList items={heuteItems} visible={HEUTE_VISIBLE} readOnly={ctx.preview} />
                </>
              ) : (
                <div className="space-y-2 px-4 py-4 text-sm sm:px-5" data-heute-leer>
                  <p>Gerade ist niemand dran. Kunden erscheinen hier nach Lob, einem Termin oder 21 Tage nach dem Abschluss.</p>
                  <Link href="/buyer/empfehlungen?tab=teilen" className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-[color:var(--brand)] hover:underline">
                    <QrCode className="h-4 w-4" /> QR-Code im Termin zeigen
                  </Link>
                </div>
              )}
            </Card>

            {todo ? (
              <Card data-empfehlung-todo>
                <CardHeader title="Zu erledigen" icon={ClipboardList} count={todo} />
                <ul className="divide-y divide-[color:var(--border)] text-sm">
                  {critiques.map((c) => (
                    <li key={c.id} className="space-y-2 px-4 py-3 sm:px-5" data-todo="kritik">
                      <div className="flex items-center gap-2">
                        <Badge tone="danger">Kritik</Badge>
                        <Link href={`/buyer/leads/${c.lead.id}`} className="min-w-0 truncate font-semibold hover:underline">
                          {c.lead.name ?? "Kontakt"}
                        </Link>
                      </div>
                      {c.comment ? <p className="line-clamp-2 text-[color:var(--muted)]">„{c.comment}“</p> : null}
                      <div className="flex flex-wrap gap-2">
                        {c.lead.phone ? (
                          <a href={`tel:+${c.lead.phone.replace(/\D/g, "")}`} className={buttonClass("secondary", "sm")}>
                            <Phone className="h-3.5 w-3.5" /> Anrufen
                          </a>
                        ) : null}
                        <ResolveButton requestId={c.id} readOnly={ctx.preview} />
                      </div>
                    </li>
                  ))}
                  {badReviews ? (
                    <li data-todo="google">
                      <Link href="/buyer/empfehlungen?tab=teilen#bewertungen" className="flex min-h-12 items-center gap-2 px-4 py-3 hover:bg-[color:var(--surface-sunken)] sm:px-5">
                        <Star className="h-4 w-4 shrink-0 text-amber-500" />
                        <span className="min-w-0 flex-1">Google-Bewertung ohne Antwort{badReviews > 1 ? ` (${badReviews})` : ""}</span>
                        <span className="font-semibold text-[color:var(--brand)]">Antworten</span>
                      </Link>
                    </li>
                  ) : null}
                  {cands.noConsent.length ? (
                    <li data-todo="einwilligung">
                      <details className="group">
                        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-[color:var(--surface-sunken)] sm:px-5 [&::-webkit-details-marker]:hidden">
                          <Check className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                          <span className="min-w-0 flex-1">
                            Zustimmung fehlt bei <b>{cands.noConsent.length}</b> von {cands.closings} Abschlüssen
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
                        </summary>
                        <p className="px-4 pb-1 text-xs text-[color:var(--muted)] sm:px-5">{FEEDBACK_CONSENT_LABEL}.</p>
                        <ul className="divide-y divide-[color:var(--border)]" data-consent-list>
                          {cands.noConsent.slice(0, 20).map((c) => (
                            <li key={c.id} className="flex items-center gap-2 px-4 py-2.5 sm:px-5" data-consent-row={c.id}>
                              <span className="min-w-0 flex-1">
                                <Link href={`/buyer/leads/${c.id}`} className="block truncate font-medium hover:underline">
                                  {c.name}
                                </Link>
                                <span className="block truncate text-xs text-[color:var(--muted)]">{c.reasonText}</span>
                              </span>
                              <ConsentButton leadId={c.id} readOnly={ctx.preview} />
                              <QrIconButton leadId={c.id} readOnly={ctx.preview} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ) : null}
                  {rewards.map((r) => (
                    <li key={r.leadId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5" data-todo="dankeschoen">
                      <span className="min-w-0 flex-1">
                        Dankeschön <b>{r.label}</b> für{" "}
                        {r.recommenderLeadId ? (
                          <Link href={`/buyer/leads/${r.recommenderLeadId}`} className="font-medium hover:underline">
                            {r.recommender}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.recommender}</span>
                        )}
                        {r.dueAt && r.dueAt.getTime() > nowMs() ? <span className="block text-xs text-[color:var(--muted)]">Frühestens ab {fmtDate(r.dueAt)}</span> : null}
                      </span>
                      <RewardButtons leadId={r.leadId} readOnly={ctx.preview} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}

            <Card data-empfehlung-funnel-card>
              <div className="px-4 pt-4 sm:px-5">
                <EmpfehlungFunnelLine s={stats} />
              </div>
              <details className="group" data-empfehlung-auswertung>
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1 px-4 text-sm font-semibold text-[color:var(--brand)] sm:px-5 [&::-webkit-details-marker]:hidden">
                  Auswertung ansehen <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                </summary>
                <div className="space-y-5 border-t border-[color:var(--border)] px-4 py-4 sm:px-5">
                  <EmpfehlungFunnel s={stats} />
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3" data-empfehlung-details>
                    {[
                      ["Bewertungsbitten gesendet", stats.asked],
                      ["Google-Link geöffnet", stats.googleClickers],
                      ["Lob", stats.positive],
                      ["Kritik (geklärt)", `${stats.negative} (${stats.resolved})`],
                      ["Frage", stats.neutral],
                      ["Empfehlungsbitten", stats.referralsAsked],
                      ["Zeit bis zum ersten Anruf (Median)", fmtHours(stats.firstCallHours)],
                    ].map(([k, v]) => (
                      <div key={String(k)}>
                        <dt className="text-[color:var(--muted)]">{k}</dt>
                        <dd className="font-semibold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {requests.length ? (
                    <div>
                      <h3 className="mb-1 text-sm font-semibold">Letzte Bewertungsbitten</h3>
                      <ul className="divide-y divide-[color:var(--border)] text-sm" data-empfehlung-list>
                        {requests.map((r) => (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                            <Link href={`/buyer/leads/${r.lead.id}`} className="font-medium hover:underline">
                              {r.lead.name ?? "Kontakt"}
                            </Link>
                            <span className="text-[color:var(--muted)]">
                              {STATUS[r.status] ?? r.status}
                              {r.reviewSentAt ? ` am ${fmtDate(r.reviewSentAt)}` : r.status === "scheduled" ? ` für ${fmtDate(r.reviewDueAt)}` : ""}
                            </span>
                            {r.sentiment && SENTIMENT[r.sentiment] ? <Badge tone={SENTIMENT[r.sentiment].tone}>{SENTIMENT[r.sentiment].text}</Badge> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </details>
            </Card>
          </>
        ) : null}

        {tab === "einstellungen" ? (
          <SettingsForm
            initial={{
              active: settings.active,
              googleReviewUrl: settings.googleReviewUrl ?? "",
              reviewDelayDays: settings.reviewDelayDays,
              referralDelayDays: settings.referralDelayDays,
              custom: settings.custom,
              offerKind: settings.offerKind,
              offerHeadline: settings.offerHeadline ?? "",
              offerText: settings.offerText ?? "",
              referralOnPraise: settings.referralOnPraise,
              statusUpdates: settings.statusUpdates,
              followUpHours: settings.followUpHours,
              referralAfterAppointment: settings.referralAfterAppointment,
              reward: { kind: settings.rewardRaw.kind, amount: settings.rewardRaw.amount, note: settings.rewardRaw.note, trigger: settings.rewardRaw.trigger, confirmed: !!settings.rewardRaw.confirmedAt },
            }}
            vermittlerTyp={customer?.vermittlerTyp ?? null}
            linkExample={referralLinkFor("…")}
            vertreter={personFromCustomerName(customer?.name ?? "") || vertreter}
            an={settings.leadAn}
            readOnly={ctx.preview}
            testForm={
              <details className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white px-4 text-sm" data-empfehlung-test>
                <summary className="flex min-h-12 cursor-pointer items-center font-semibold">Test an mich senden</summary>
                <div className="pb-4">
                  <TestSendForm readOnly={ctx.preview} />
                </div>
              </details>
            }
          />
        ) : null}

        {tab === "teilen" ? (
          <>
            <Card data-empfehlung-teilen>
              <CardHeader title="Allgemeiner Empfehlungslink" icon={QrCode} />
              <div className="space-y-3 px-4 pb-5 pt-4 text-center text-sm sm:px-5">
                {generalQr && generalUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={generalQr} alt="QR-Code zum allgemeinen Empfehlungslink" className="mx-auto h-56 w-56 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-2" data-general-qr />
                    <p className="text-[color:var(--muted)]">Im Termin scannen lassen oder weitergeben, persönliche Links senden Sie im Kontakt.</p>
                    <CopyText text={generalUrl} label="Link kopieren" primary />
                  </>
                ) : (
                  <p className="text-[color:var(--muted)]">In der Vorschau wird kein Link angelegt.</p>
                )}
              </div>
              {generalUrl ? (
                <details className="group border-t border-[color:var(--border)]" data-empfehlung-signatur-box>
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">E-Mail-Signatur</span>
                    <ChevronDown className="h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-2 px-4 pb-4 text-sm sm:px-5">
                    <p className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-3 text-xs [overflow-wrap:anywhere]" data-empfehlung-signatur>
                      {signatureLine(generalUrl, offer, settings.leadAn)}
                    </p>
                    <CopyText text={signatureLine(generalUrl, offer, settings.leadAn)} label="Zeile kopieren" />
                  </div>
                </details>
              ) : null}
            </Card>

            <WaechterSection customerId={ctx.customerId} readOnly={ctx.preview} flash={sp.google ?? null} />
          </>
        ) : null}
      </div>
    </main>
  );
}

function StartStep({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5" data-start-step={n} data-done={done ? "1" : "0"}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-emerald-100 text-emerald-700" : "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]"}`}>
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`font-semibold ${done ? "text-[color:var(--muted)]" : ""}`}>{title}</div>
        {children ? <div className="mt-1.5">{children}</div> : null}
      </div>
    </li>
  );
}
