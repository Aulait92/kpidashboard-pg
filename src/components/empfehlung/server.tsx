// Modul „Empfehlungen & Bewertungen“: Bausteine für Kontaktakte, Heute und Wachstum.
// Hinweise auf das Modul: nur für Inhaber, nur ohne aktives Modul, je Stelle einmal wegklickbar.

import Link from "next/link";
import { Lightbulb, Lock, MessageSquareHeart, Star } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import type { TeamCtx } from "@/lib/team";
import { moduleInfo, recentClosings } from "@/lib/empfehlung/module";
import { loadEmpfehlungStats, type EmpfehlungStats } from "@/lib/empfehlung/requests";
import { BAD_REVIEW_TASK } from "@/lib/empfehlung/google-business";
import { ANNOUNCEMENT_KEY, CANDIDATE_MIN_CLOSINGS, DAY_MS, HINTS, fmtDate, isUnhappyTask } from "@/lib/empfehlung/shared";
import { ModuleHint, OptOutToggle, ReferralLinkButton } from "@/components/empfehlung/client";

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Kontaktakte: Stand der Nachfrage, „Nicht anfragen“, Empfehlungslink – bzw. dezenter Hinweis nach einem frischen Abschluss. */
export async function EmpfehlungLeadCard({ leadId, team, readOnly }: { leadId: string; team: TeamCtx & { preview?: boolean }; readOnly: boolean }) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { status: true, source: true, closedAt: true, followUpNote: true, phone: true, reviewRequest: true, ownReferralLink: { select: { lastSentAt: true, _count: { select: { referredLeads: true } } } } },
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
        text="Automatisch um eine Google-Bewertung und später um eine Empfehlung bitten? Kritik landet zuerst bei Ihnen."
        cta={info.trialAvailable ? "30 Tage kostenlos testen" : "Modul ansehen"}
      />
    );
  }

  const r = lead.reviewRequest;
  const status = !isClosed
    ? null
    : !r
      ? lead.phone
        ? "Nachfrage wird automatisch eingeplant."
        : "Keine Handynummer – keine automatische Nachfrage."
      : r.status === "off"
        ? "Nicht anfragen (von Ihnen gewählt)."
        : r.status === "scheduled" || r.status === "sending"
          ? `Nachfrage geplant für ${fmtDate(r.reviewDueAt)}${r.note ? ` · ${r.note}` : ""}.`
          : r.status === "sent"
            ? `Nachfrage gesendet am ${fmtDate(r.reviewSentAt!)}${r.googleClicks ? ` · Google-Link geöffnet` : ""}.`
            : r.status === "answered"
              ? `Antwort: ${r.sentiment === "negative" ? "Kritik" : r.sentiment === "positive" ? "positiv" : "neutral"}${r.resolvedAt ? " (geklärt)" : ""}${r.googleClicks ? " · Google-Link geöffnet" : ""}.`
              : r.note
                ? `Keine Nachfrage: ${r.note}.`
                : "Keine Nachfrage.";
  const referral =
    r?.referralStatus === "sent"
      ? `Bitte um Empfehlung gesendet am ${fmtDate(r.referralSentAt!)}.`
      : r?.referralStatus === "skipped"
        ? "Keine Bitte um Empfehlung."
        : isUnhappyTask(lead.followUpNote)
          ? "Bitte um Empfehlung wartet, bis die Aufgabe „unzufrieden“ erledigt ist."
          : r?.referralDueAt
            ? `Bitte um Empfehlung geplant für ${fmtDate(r.referralDueAt)}.`
            : null;
  const referred = lead.ownReferralLink?._count.referredLeads ?? 0;
  const canOptOut = isClosed && (!r || r.status === "scheduled" || r.status === "off");

  return (
    <Card className="mb-5" data-empfehlung-lead>
      <CardHeader title="Empfehlungen & Bewertungen" icon={MessageSquareHeart} />
      <div className="space-y-3 px-5 pb-5 pt-4 text-sm">
        {status ? <p>{status}</p> : null}
        {referral ? <p className="text-[color:var(--muted)]">{referral}</p> : null}
        {referred ? <p className="font-medium text-emerald-700">{referred === 1 ? "1 Empfehlung" : `${referred} Empfehlungen`} über den Link dieses Kunden.</p> : null}
        <div className="flex flex-wrap items-start gap-3">
          {canOptOut ? <OptOutToggle leadId={leadId} off={r?.status === "off"} readOnly={readOnly} /> : null}
          <ReferralLinkButton leadId={leadId} readOnly={readOnly} />
        </div>
        {canOptOut ? (
          <p className="text-sm text-[color:var(--muted)]">„Nicht anfragen“ z. B. bei Kunden, die keine Nachrichten möchten. Alle anderen bekommen dieselbe Nachricht mit Google-Link.</p>
        ) : null}
      </div>
    </Card>
  );
}

/** Heute: Hinweis-Karte (≥ 3 Abschlüsse in 60 Tagen ohne Modul) bzw. Ankündigung. Nur Inhaber. */
export async function EmpfehlungHeuteHint({ ctx }: { ctx: { customerId: string; teamRole: string; preview: boolean } }) {
  if (ctx.teamRole !== "owner") return null;
  const info = await moduleInfo(ctx.customerId);
  if (info?.active) {
    // Bewertungs-Wächter: schlechte Google-Bewertung ohne Antwort → Aufgabe in „Heute“
    const bad = await prisma.googleReview.count({ where: { customerId: ctx.customerId, stars: { lte: 3 }, repliedAt: null, notifiedAt: { not: null } } });
    if (!bad) return null;
    return (
      <Link
        href="/buyer/empfehlungen#bewertungen"
        className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        data-gbp-heute
      >
        <Star className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <b>{BAD_REVIEW_TASK}</b> {bad > 1 ? `(${bad})` : ""}
        </span>
        <span className="font-semibold">Antworten</span>
      </Link>
    );
  }
  if (!info || info.service) return null;
  const closings = info.dismissed.includes(HINTS.heute) ? 0 : await recentClosings(ctx.customerId);
  if (closings >= CANDIDATE_MIN_CLOSINGS) {
    return (
      <ModuleHint
        hintKey={HINTS.heute}
        title={`${closings} zufriedene Kunden könnten Sie weiterempfehlen`}
        text="Mit „Empfehlungen & Bewertungen“ fragt die App nach jedem Abschluss automatisch nach einer Google-Bewertung und später nach einer Empfehlung."
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
      text="Nach jedem Abschluss automatisch um eine Google-Bewertung und eine Empfehlung bitten. Kritik landet zuerst bei Ihnen."
      cta={info.trialAvailable ? "30 Tage kostenlos testen" : "Modul ansehen"}
    />
  );
}

/** Kennzahlen des Moduls. */
export function EmpfehlungStatsGrid({ s }: { s: EmpfehlungStats }) {
  const tiles: { k: string; v: string; sub?: string; strong?: boolean }[] = [
    { k: "Empfehlungs-Leads", v: String(s.referralLeads), sub: `${s.referralViews} Aufrufe der Empfehlungsseiten`, strong: true },
    { k: "daraus Termine", v: String(s.referralMeetings), strong: true },
    { k: "daraus Abschlüsse", v: String(s.referralClosings), strong: true },
    { k: "geschätzte Provision", v: eur(s.referralProvision), sub: "aus Empfehlungen (Ihre Provisionssätze)", strong: true },
    { k: "Nachfragen gesendet", v: String(s.asked) },
    { k: "Klicks auf Google-Link", v: String(s.googleClicks), sub: `${s.googleClickers} Kunden` },
    { k: "Rückmeldungen positiv", v: String(s.positive) },
    { k: "Rückmeldungen kritisch", v: String(s.negative), sub: `${s.resolved} davon geklärt` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-empfehlung-stats>
      {tiles.map((t) => (
        <div key={t.k} className={`rounded-[var(--radius-md)] border p-3 ${t.strong ? "border-emerald-200 bg-emerald-50/50" : "border-[color:var(--border)] bg-white"}`}>
          <div className="text-2xl font-semibold tabular-nums">{t.v}</div>
          <div className="text-xs font-medium">{t.k}</div>
          {t.sub ? <div className="text-xs text-[color:var(--muted)]">{t.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** Trichter: Vom Empfehlungslink zum Neukunden. Mit einem Hinweis für den auffälligsten Übergang. */
export function EmpfehlungFunnel({ s }: { s: EmpfehlungStats }) {
  const f = s.funnel;
  const steps: { k: string; v: number; sub: string }[] = [
    { k: "Links ausgegeben", v: f.linksSent, sub: "gesendet oder im Termin gezeigt" },
    { k: "Kunde hat geöffnet", v: f.linksOpened, sub: "Ihre Kunden, die ihren Empfehlungslink geöffnet haben" },
    { k: "Bekannte haben geöffnet", v: f.visitors, sub: "Personen, die den weitergeleiteten Link geöffnet haben" },
    { k: "Empfehlungen", v: f.leads, sub: "haben sich eingetragen" },
    { k: "Neukunden", v: f.closings, sub: "Abschlüsse aus Empfehlungen" },
  ];
  const max = Math.max(1, ...steps.map((x) => x.v));
  return (
    <div className="space-y-3" data-empfehlung-funnel>
      <ol className="space-y-1.5">
        {steps.map((x) => (
          <li key={x.k} className="grid grid-cols-[2.5rem_1fr] items-center gap-3 text-sm sm:grid-cols-[2.5rem_11rem_1fr]">
            <span className="text-right text-lg font-semibold tabular-nums">{x.v}</span>
            <span>
              <span className="font-medium">{x.k}</span>
              <span className="block text-xs text-[color:var(--muted)]">{x.sub}</span>
            </span>
            <span className="col-span-2 h-2 rounded-full bg-[color:var(--surface-sunken)] sm:col-span-1" aria-hidden="true">
              <span className="block h-2 rounded-full bg-emerald-500" style={{ width: `${Math.round((x.v / max) * 100)}%` }} />
            </span>
          </li>
        ))}
      </ol>
      <div className={`flex items-start gap-2 rounded-[var(--radius-md)] border px-4 py-3 text-sm ${s.hint.stage === "ok" ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50"}`} data-empfehlung-funnel-hint={s.hint.stage}>
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <b>{s.hint.title}.</b> {s.hint.text}
        </span>
      </div>
      <p className="text-xs text-[color:var(--muted)]">Bekannte werden je Person einmal gezählt, Link-Vorschauen zählen nicht. Empfehlungen über den Link in der E-Mail-Signatur zählen bei Bekannten, Empfehlungen und Neukunden mit.</p>
    </div>
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
          <EmpfehlungStatsGrid s={s} />
          <Link href="/buyer/empfehlungen" className="text-sm font-semibold text-[color:var(--brand)] hover:underline">
            Zum Modul
          </Link>
        </div>
      </Card>
    );
  }
  if (ctx.teamRole !== "owner" || info.dismissed.includes(HINTS.zahlen)) return null;
  return (
    <div className="mb-5 flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-strong)] bg-white px-4 py-3 text-sm" data-empfehlung-locked>
      <Lock className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold">Empfehlungen</span>
        <span className="text-[color:var(--muted)]"> – Leads, Termine, Abschlüsse und Provision aus Empfehlungen Ihrer Kunden.</span>
      </div>
      <Link href="/buyer/konto?modul=empfehlung#zusatzmodule" className="shrink-0 font-semibold text-[color:var(--brand)] hover:underline">
        Freischalten
      </Link>
    </div>
  );
}
