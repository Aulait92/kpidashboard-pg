// Modul „Empfehlungen & Bewertungen“: Bausteine für Kontaktakte, Heute und Wachstum.
// Hinweise auf das Modul: nur für Inhaber, nur ohne aktives Modul, je Stelle einmal wegklickbar.

import Link from "next/link";
import { ChevronRight, Lightbulb, Lock, MessageSquareHeart, Star } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import type { TeamCtx } from "@/lib/team";
import { moduleInfo, recentClosings } from "@/lib/empfehlung/module";
import { loadEmpfehlungStats, loadReferralCandidates, type EmpfehlungStats } from "@/lib/empfehlung/requests";
import { BAD_REVIEW_TASK } from "@/lib/empfehlung/google-business";
import { ANNOUNCEMENT_KEY, CANDIDATE_APPOINTMENT_DAYS, CANDIDATE_MIN_CLOSINGS, DAY_MS, EMPFEHLUNG_MODULE_AVAILABLE, HEUTE_FRAGEN_HREF, HINTS, MODULE_COST_90, WAECHTER_HREF, costMultiple, feedbackConsentQuestion, fmtDate, isUnhappyTask } from "@/lib/empfehlung/shared";
import { asAnsprache } from "@/lib/ansprache";
import { FeedbackConsentToggle, ModuleHint, OptOutToggle, ReferralLinkButton } from "@/components/empfehlung/client";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/**
 * Abschluss-Karte im Kontakt: Einwilligung in Nachfrage, Google-Bewertung und gelegentliche Empfehlungsbitte, direkt
 * beim Abschluss mit einem Tipp (Paket 1). Nur mit aktivem Modul, Handynummer und ohne STOPP. Ohne sie geht keine Bitte raus.
 */
export async function EmpfehlungConsentRow({ leadId, customerId, readOnly }: { leadId: string; customerId: string; readOnly: boolean }) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true, phone: true, erasedAt: true, feedbackConsentAt: true, feedbackOptOutAt: true } });
  if (!lead || lead.status !== "Abschluss" || !lead.phone || lead.erasedAt || lead.feedbackOptOutAt) return null;
  const info = await moduleInfo(customerId);
  if (!info?.active) return null;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } });
  return (
    <div className="border-t border-[color:var(--border)] px-5 py-2" data-abschluss-einwilligung>
      <FeedbackConsentToggle leadId={leadId} consent={!!lead.feedbackConsentAt} question={feedbackConsentQuestion(asAnsprache(c?.leadAddress))} readOnly={readOnly} />
    </div>
  );
}

/**
 * Kontakt-Karte (Paket 2): Verlauf als Badges in einer Zeile, ein primärer Knopf „Empfehlungslink senden“ mit
 * automatischem Anlass, Zweitknopf „Im Termin zeigen“, Anlass und „Nicht anfragen“ unter „Mehr“. Ohne Einwilligung
 * ein Satz und der Knopf „Kunde hat zugestimmt“. Ohne aktives Modul: dezenter Hinweis nach einem frischen Abschluss.
 */
export async function EmpfehlungLeadCard({ leadId, team, readOnly }: { leadId: string; team: TeamCtx & { preview?: boolean }; readOnly: boolean }) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      status: true,
      source: true,
      closedAt: true,
      followUpNote: true,
      phone: true,
      feedbackConsentAt: true,
      feedbackOptOutAt: true,
      reviewRequest: true,
      bestandKunde: { select: { optOutAt: true, blockedAt: true } },
      ownReferralLink: { select: { lastSentAt: true, _count: { select: { referredLeads: true } } } },
      appointments: { where: { status: "completed", startsAt: { gte: new Date(nowMs() - CANDIDATE_APPOINTMENT_DAYS * DAY_MS) } }, take: 1, select: { id: true } },
    },
  });
  if (!lead) return null;
  const isClosed = lead.status === "Abschluss";
  const isBestand = lead.source === "Bestandskunde";
  if (!isClosed && !isBestand && !lead.ownReferralLink) return null;
  const info = await moduleInfo(team.customerId);
  if (!info) return null;

  if (!info.active) {
    // Hinweis direkt nach einem Abschluss (14 Tage), nur Inhaber
    const fresh = isClosed && lead.closedAt && nowMs() - lead.closedAt.getTime() < 14 * DAY_MS;
    if (team.teamRole !== "owner" || info.service || !fresh || info.dismissed.includes(HINTS.abschluss)) return null;
    return (
      <ModuleHint
        hintKey={HINTS.abschluss}
        tone="success"
        title="Glückwunsch zum Abschluss!"
        text="Automatisch um eine ehrliche Google-Bewertung und später um eine Empfehlung bitten, Kritik landet zuerst bei Ihnen."
        cta={info.trialAvailable ? "30 Tage kostenlos testen" : "Modul ansehen"}
      />
    );
  }

  const r = lead.reviewRequest;
  const stopp = !!(lead.feedbackOptOutAt || lead.bestandKunde?.optOutAt || lead.bestandKunde?.blockedAt);
  const noConsent = !stopp && !!lead.phone && !lead.feedbackConsentAt;
  const referred = lead.ownReferralLink?._count.referredLeads ?? 0;
  const askedAt = r?.referralSentAt ?? lead.ownReferralLink?.lastSentAt ?? null;
  const canOptOut = isClosed && (!r || r.status === "scheduled" || r.status === "off");
  const badges: { k: string; tone: "neutral" | "success" | "warning" | "danger" | "info"; text: string }[] = [];
  if (stopp) badges.push({ k: "stopp", tone: "danger", text: "STOPP" });
  else if (noConsent) badges.push({ k: "consent", tone: "warning", text: "Zustimmung fehlt" });
  if (r?.status === "off") badges.push({ k: "off", tone: "neutral", text: "Nicht anfragen" });
  else if (r?.reviewSentAt) badges.push({ k: "review", tone: "neutral", text: `Bewertungsbitte ${fmtDate(r.reviewSentAt)}` });
  else if (r && (r.status === "scheduled" || r.status === "sending") && !stopp && !noConsent) badges.push({ k: "review", tone: "neutral", text: `Bewertungsbitte ab ${fmtDate(r.reviewDueAt)}` });
  if (r?.sentiment === "positive") badges.push({ k: "lob", tone: "success", text: "Lob" });
  if (r?.sentiment === "negative") badges.push({ k: "kritik", tone: r.resolvedAt ? "neutral" : "danger", text: r.resolvedAt ? "Kritik geklärt" : "Kritik" });
  if (r?.sentiment === "neutral") badges.push({ k: "frage", tone: "info", text: "Frage" });
  if (r?.googleClicks) badges.push({ k: "google", tone: "success", text: "Google geöffnet" });
  if (askedAt) badges.push({ k: "bitte", tone: "neutral", text: `Empfehlungsbitte ${fmtDate(askedAt)}` });
  if (referred) badges.push({ k: "empf", tone: "success", text: referred === 1 ? "1 Empfehlung" : `${referred} Empfehlungen` });
  if (isUnhappyTask(lead.followUpNote)) badges.push({ k: "wartet", tone: "warning", text: "Wartet auf Klärung" });

  return (
    <Card className="mb-5" data-empfehlung-lead>
      <CardHeader title="Empfehlungen & Bewertungen" icon={MessageSquareHeart} />
      <div className="space-y-3 px-5 pb-4 pt-3 text-sm">
        {badges.length ? (
          <div className="flex flex-wrap gap-1.5" data-empfehlung-verlauf>
            {badges.map((b) => (
              <Badge key={b.k} tone={b.tone}>
                {b.text}
              </Badge>
            ))}
          </div>
        ) : null}
        {stopp ? (
          <p className="text-[color:var(--muted)]">Der Kunde hat mit STOPP widersprochen, es geht nichts mehr raus.</p>
        ) : (
          <>
            {noConsent ? (
              <p data-feedback-consent-missing>{isClosed ? "Ohne Zustimmung geht keine Nachricht raus: Häkchen oben in der Abschluss-Karte setzen oder den QR-Code zeigen." : "Ohne Zustimmung des Kunden geht keine Nachricht raus."}</p>
            ) : null}
            <ReferralLinkButton
              leadId={leadId}
              readOnly={readOnly}
              needsConsent={noConsent}
              consentAbove={noConsent && isClosed}
              defaultOccasion={lead.appointments.length ? "jahresgespraech" : null}
              more={canOptOut ? <OptOutToggle leadId={leadId} off={r?.status === "off"} readOnly={readOnly} /> : undefined}
            />
          </>
        )}
      </div>
    </Card>
  );
}

/** Heute: Hinweis-Karte (≥ 3 Abschlüsse in 60 Tagen ohne Modul) bzw. Ankündigung. Nur Inhaber. */
export async function EmpfehlungHeuteHint({ ctx }: { ctx: { customerId: string; teamRole: string; preview: boolean } }) {
  if (ctx.teamRole !== "owner") return null;
  const info = await moduleInfo(ctx.customerId);
  if (info?.active) {
    // Bewertungs-Wächter: schlechte Google-Bewertung ohne Antwort → Aufgabe in „Heute“; dazu „n Kunden bereit“
    const [bad, cand] = await Promise.all([
      prisma.googleReview.count({ where: { customerId: ctx.customerId, stars: { lte: 3 }, repliedAt: null, notifiedAt: { not: null } } }),
      loadReferralCandidates(ctx.customerId).catch(() => null),
    ]);
    const ready = cand?.ready.length ?? 0;
    if (!bad && !ready) return null;
    return (
      <div className="mb-5 space-y-2">
        {bad ? (
          <Link href={WAECHTER_HREF} className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" data-gbp-heute>
            <Star className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <b>{BAD_REVIEW_TASK}</b> {bad > 1 ? `(${bad})` : ""}
            </span>
            <span className="font-semibold">Antworten</span>
          </Link>
        ) : null}
        {ready ? (
          <Link href={HEUTE_FRAGEN_HREF} className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950" data-empfehlung-heute>
            <MessageSquareHeart className="h-4 w-4 shrink-0 text-emerald-700" />
            <span className="min-w-0 flex-1">
              <b>{ready === 1 ? "1 Kunde bereit für eine Empfehlung" : `${ready} Kunden bereit für eine Empfehlung`}</b>
            </span>
            <span className="inline-flex items-center gap-0.5 font-semibold">
              Ansehen <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        ) : null}
      </div>
    );
  }
  if (!info || info.service) return null;
  const closings = info.dismissed.includes(HINTS.heute) ? 0 : await recentClosings(ctx.customerId);
  if (closings >= CANDIDATE_MIN_CLOSINGS) {
    return (
      <ModuleHint
        hintKey={HINTS.heute}
        title={`${closings} zufriedene Kunden könnten Sie weiterempfehlen`}
        text="Mit „Empfehlungen & Bewertungen“ fragt die App nach jedem Abschluss mit Einverständnis des Kunden nach einer ehrlichen Google-Bewertung und später nach einer Empfehlung."
        cta={info.trialAvailable ? "30 Tage kostenlos testen" : "Modul ansehen"}
      />
    );
  }
  if (info.dismissed.includes(HINTS.neu)) return null;
  const announced = await prisma.moduleAnnouncement.findUnique({ where: { key: ANNOUNCEMENT_KEY }, select: { id: true } });
  if (!announced) return null;
  return (
    <ModuleHint
      hintKey={HINTS.neu}
      title="Neu: Empfehlungen & Bewertungen"
      text="Nach jedem Abschluss mit Einverständnis des Kunden um eine ehrliche Google-Bewertung und eine Empfehlung bitten. Kritik landet zuerst bei Ihnen."
      cta={info.trialAvailable ? "30 Tage kostenlos testen" : "Modul ansehen"}
    />
  );
}

/**
 * Wert-Zeile (Paket 2): Provision aus Empfehlungen (90 Tage, geschätzt, mit Grundlage) im Vergleich zu den
 * Modulkosten, darunter drei kleine Werte. Ersetzt das 8-Kachel-Raster.
 */
export function EmpfehlungWert({ s }: { s: EmpfehlungStats }) {
  const multiple = costMultiple(s.referralProvision);
  const small: { k: string; v: number }[] = [
    { k: "Empfehlungen", v: s.referralLeads },
    { k: "Termine", v: s.referralMeetings },
    { k: "Neukunden", v: s.referralClosings },
  ];
  return (
    <div data-empfehlung-wert>
      <div className="text-sm font-medium text-[color:var(--muted)]">Provision aus Empfehlungen, 90 Tage</div>
      <div className="mt-0.5 text-3xl font-semibold tabular-nums tracking-tight" data-empfehlung-provision>
        ca. {eur(s.referralProvision)}
      </div>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        {multiple ? <b className="font-semibold text-emerald-700">Das {multiple} der Modulkosten. </b> : null}
        Geschätzt mit Ihren Provisionssätzen, Modul {eur(MODULE_COST_90)} je 90 Tage.
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2" data-empfehlung-stats>
        {small.map((x) => (
          <div key={x.k} className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2">
            <dd className="text-xl font-semibold tabular-nums">{x.v}</dd>
            <dt className="text-xs text-[color:var(--muted)]">{x.k}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Eine Trichter-Zeile mit dem einen Tipp (funnelHint). Details stehen in „Auswertung ansehen“. */
export function EmpfehlungFunnelLine({ s }: { s: EmpfehlungStats }) {
  const f = s.funnel;
  return (
    <div className="space-y-2" data-empfehlung-funnel-line>
      <p className="text-sm tabular-nums">
        <b>{f.linksSent}</b> Links <span className="text-[color:var(--muted)]">→</span> <b>{f.linksOpened}</b> geöffnet <span className="text-[color:var(--muted)]">→</span> <b>{f.leads}</b> Empfehlungen{" "}
        <span className="text-[color:var(--muted)]">→</span> <b>{f.closings}</b> Neukunden
      </p>
      <p className="flex items-start gap-2 text-sm" data-empfehlung-funnel-hint={s.hint.stage}>
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>{s.hint.text}</span>
      </p>
    </div>
  );
}

/** Trichter im Detail (in „Auswertung ansehen“). */
export function EmpfehlungFunnel({ s }: { s: EmpfehlungStats }) {
  const f = s.funnel;
  const steps: { k: string; v: number }[] = [
    { k: "Empfehlungslinks gesendet oder gezeigt", v: f.linksSent },
    { k: "Kunde hat geöffnet", v: f.linksOpened },
    { k: "Bekannte haben geöffnet", v: f.visitors },
    { k: "Empfehlungen", v: f.leads },
    { k: "Neukunden aus Empfehlungen", v: f.closings },
  ];
  const max = Math.max(1, ...steps.map((x) => x.v));
  return (
    <ol className="space-y-2" data-empfehlung-funnel>
      {steps.map((x) => (
        <li key={x.k} className="grid grid-cols-[2.5rem_1fr] items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-right text-base font-semibold tabular-nums">{x.v}</span>
          <span>{x.k}</span>
          <span className="col-start-2 h-1.5 rounded-full bg-[color:var(--surface-sunken)]" aria-hidden="true">
            <span className="block h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.round((x.v / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Wachstum/Zahlen: Zeile „Empfehlungen“ – mit Schloss ohne Modul, sonst Kurzauswertung. */
export async function EmpfehlungGrowthRow({ ctx }: { ctx: { customerId: string; teamRole: string } }) {
  const info = await moduleInfo(ctx.customerId);
  if (!info || info.service) return null;
  if (info.active) {
    const s = await loadEmpfehlungStats(ctx.customerId, 90);
    return (
      <Card className="mb-5">
        <CardHeader title="Empfehlungen & Bewertungen (90 Tage)" icon={Star} />
        <div className="space-y-3 px-5 pb-5 pt-4">
          <EmpfehlungWert s={s} />
          <Link href="/buyer/empfehlungen" className="text-sm font-semibold text-[color:var(--brand)] hover:underline">
            Zum Modul
          </Link>
        </div>
      </Card>
    );
  }
  if (!EMPFEHLUNG_MODULE_AVAILABLE || ctx.teamRole !== "owner" || info.dismissed.includes(HINTS.zahlen)) return null;
  return (
    <div className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-strong)] bg-white px-4 py-3 text-sm" data-empfehlung-locked>
      <Lock className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Empfehlungen</span>
        <span className="text-[color:var(--muted)]">, Leads, Termine, Abschlüsse und Provision aus Empfehlungen Ihrer Kunden.</span>
      </div>
      <Link href="/buyer/konto?modul=empfehlung#zusatzmodule" className="shrink-0 font-semibold text-[color:var(--brand)] hover:underline">
        Freischalten
      </Link>
    </div>
  );
}
