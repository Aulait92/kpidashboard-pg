// Monatsberichte für Kunden: Zahlen sammeln, intern einstufen, Text von Claude schreiben
// lassen, prüfen (deterministisch + KI), dann je nach Einstufung automatisch senden (nur
// „gut“ und nur, wenn eingeschaltet) oder als Entwurf mit Aufgabe für Ole ablegen.
// Garantien werden nie erwähnt (für Kunden bewusst ausgeblendet).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { CLOSED_STATUS } from "@/lib/products";
import { estimatedProvision } from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";
import { loadRechnerConfig } from "@/lib/rechner-server";
import { ergebnisQuote } from "@/lib/garantien";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { PROVIDER } from "@/lib/legal-texts";
import { customerGreeting } from "@/lib/offer-links";
import { claudeCall, runAgent, type AgentUsage, type LlmCall } from "@/lib/kampagnen/llm";
import type { Valid } from "@/lib/kampagnen/types";
import {
  allowedNumbers,
  checkText,
  classify,
  DEFAULT_THRESHOLDS,
  eligible,
  fmtValue,
  monthBounds,
  monthLabel,
  previousMonthKey,
  shiftMonth,
  visibleFacts,
  type CheckResult,
  type Classification,
  type Fact,
  type MonthMetrics,
  type ReportMetrics,
  type ReportThresholds,
} from "@/lib/monatsbericht/shared";

const NOT_STORNO = { OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] };

// ─── Einstellungen ───────────────────────────────────────────────────────

export type ReportSettingsView = ReportThresholds & { autoSendGood: boolean; senderName: string | null; targetCpl: number | null; bookingUrl: string | null };

export async function loadReportSettings(): Promise<ReportSettingsView> {
  const r = await prisma.reportSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return {
    ...DEFAULT_THRESHOLDS,
    autoSendGood: false,
    senderName: null,
    targetCpl: null,
    bookingUrl: null,
    ...(r
      ? {
          autoSendGood: r.autoSendGood,
          senderName: r.senderName,
          goodLeadsPct: r.goodLeadsPct,
          weakLeadsPct: r.weakLeadsPct,
          weakCplPct: r.weakCplPct,
          weakNoMeetingLeads: r.weakNoMeetingLeads,
          minResultPct: r.minResultPct,
          minActiveDays: r.minActiveDays,
          targetCpl: r.targetCpl != null ? Number(r.targetCpl) : null,
          bookingUrl: r.bookingUrl,
        }
      : {}),
  };
}

export async function saveReportSettings(input: Partial<Omit<ReportSettingsView, "targetCpl">> & { targetCpl?: number | null }, actor?: AuditActor) {
  const data = {
    ...(input.autoSendGood != null ? { autoSendGood: input.autoSendGood } : {}),
    ...(input.senderName !== undefined ? { senderName: input.senderName?.trim() || null } : {}),
    ...(input.goodLeadsPct != null ? { goodLeadsPct: clampInt(input.goodLeadsPct, 1, 300) } : {}),
    ...(input.weakLeadsPct != null ? { weakLeadsPct: clampInt(input.weakLeadsPct, 1, 300) } : {}),
    ...(input.weakCplPct != null ? { weakCplPct: clampInt(input.weakCplPct, 100, 500) } : {}),
    ...(input.weakNoMeetingLeads != null ? { weakNoMeetingLeads: clampInt(input.weakNoMeetingLeads, 1, 500) } : {}),
    ...(input.minResultPct != null ? { minResultPct: clampInt(input.minResultPct, 0, 100) } : {}),
    ...(input.minActiveDays != null ? { minActiveDays: clampInt(input.minActiveDays, 0, 31) } : {}),
    ...(input.targetCpl !== undefined ? { targetCpl: input.targetCpl && input.targetCpl > 0 ? input.targetCpl : null } : {}),
    ...(input.bookingUrl !== undefined ? { bookingUrl: /^https:\/\//.test(input.bookingUrl ?? "") ? input.bookingUrl : null } : {}),
  };
  await prisma.reportSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
  await audit("bericht.settings", { entity: "ReportSettings", entityId: "default", details: data, ...(actor ? { actor } : {}) });
}

const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));

// ─── Kennzahlen ──────────────────────────────────────────────────────────

async function monthMetrics(customerId: string, month: string, rates: Awaited<ReturnType<typeof loadCustomerProvision>>["rates"]): Promise<MonthMetrics> {
  const { from, to } = monthBounds(month);
  const [leads, spendRows, termine, closed] = await Promise.all([
    prisma.lead.findMany({ where: { customerId, createdAt: { gte: from, lt: to }, ...NOT_STORNO }, select: { createdAt: true, status: true, source: true } }),
    prisma.customerAdSpend.findMany({ where: { customerId, date: { gte: from, lt: to } }, select: { date: true, amount: true } }),
    prisma.appointment.count({ where: { customerId, startsAt: { gte: from, lt: to }, status: { not: "cancelled" } } }),
    prisma.lead.findMany({ where: { customerId, status: CLOSED_STATUS, closedAt: { gte: from, lt: to }, ...NOT_STORNO }, select: { source: true, closeValue: true } }),
  ]);
  const spend = spendRows.reduce((s, r) => s + Number(r.amount), 0);
  const activeDays = new Set(spendRows.filter((r) => Number(r.amount) > 0).map((r) => r.date.toISOString().slice(0, 10))).size;
  const prov = closed.map((l) => estimatedProvision(l.source, l.closeValue, rates));
  const provKnown = prov.filter((p): p is number => p != null);
  return {
    leads: leads.length,
    spend: Math.round(spend * 100) / 100,
    cpl: leads.length ? Math.round((spend / leads.length) * 100) / 100 : null,
    termine,
    abschluesse: closed.length,
    provision: provKnown.length ? provKnown.reduce((s, p) => s + p, 0) : null,
    ergebnisQuote: ergebnisQuote(leads.map((l) => ({ createdAt: l.createdAt, status: l.status, source: l.source })), to).quote,
    activeDays,
  };
}

async function monthActions(customerId: string, month: string): Promise<string[]> {
  const { from, to } = monthBounds(month);
  const [runs, budgets] = await Promise.all([
    prisma.campaignRun.findMany({ where: { customerId, status: "built", updatedAt: { gte: from, lt: to } }, select: { product: true } }),
    prisma.budgetChange.findMany({ where: { customerId, effectiveFrom: { gte: from, lt: to } }, select: { monthlyBudgetFrom: true, monthlyBudgetTo: true } }),
  ]);
  const out: string[] = [];
  for (const r of runs) out.push(`Neue Kampagne mit frischen Anzeigen für ${r.product} aufgesetzt`);
  for (const b of budgets) out.push(b.monthlyBudgetTo > b.monthlyBudgetFrom ? "Werbebudget erhöht" : b.monthlyBudgetTo < b.monthlyBudgetFrom ? "Werbebudget angepasst" : "Budget neu verteilt");
  return out;
}

async function targetCplFor(customerId: string, settings: ReportSettingsView): Promise<number | null> {
  if (settings.targetCpl) return settings.targetCpl;
  const [cfg, prov] = await Promise.all([loadRechnerConfig().catch(() => null), loadCustomerProvision(customerId)]);
  const tkv = cfg?.products.find((p) => p.key === "tkv");
  if (!tkv) return null;
  return prov.typ === "makler" && tkv.cplMakler ? tkv.cplMakler : tkv.cpl;
}

export async function collectMetrics(customerId: string, month: string, settings: ReportSettingsView): Promise<ReportMetrics> {
  const prov = await loadCustomerProvision(customerId);
  const [current, previous, actions, targetCpl] = await Promise.all([
    monthMetrics(customerId, month, prov.rates),
    monthMetrics(customerId, shiftMonth(month, -1), prov.rates),
    monthActions(customerId, month),
    targetCplFor(customerId, settings),
  ]);
  return {
    month,
    current,
    previous: previous.activeDays > 0 || previous.leads > 0 ? previous : null,
    expectedLeads: targetCpl && current.spend > 0 ? Math.round(current.spend / targetCpl) : null,
    targetCpl,
    actions,
  };
}

// ─── Text (Claude) und Prüfung ───────────────────────────────────────────

export type ReportDraft = { subject: string; paragraphs: string[]; tips: string[] };

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "paragraphs", "tips"],
  properties: {
    subject: { type: "string" },
    paragraphs: { type: "array", items: { type: "string" } },
    tips: { type: "array", items: { type: "string" } },
  },
};

export function validateDraft(x: unknown): Valid<ReportDraft> {
  const o = x as Partial<ReportDraft> | null;
  const errors: string[] = [];
  if (!o || typeof o !== "object") return { ok: false, errors: ["kein Objekt"] };
  if (typeof o.subject !== "string" || o.subject.trim().length < 5 || o.subject.length > 120) errors.push("subject: 5–120 Zeichen");
  if (!Array.isArray(o.paragraphs) || o.paragraphs.length < 2 || o.paragraphs.length > 7 || o.paragraphs.some((p) => typeof p !== "string" || !p.trim())) errors.push("paragraphs: 2–7 nicht leere Absätze");
  if (!Array.isArray(o.tips) || o.tips.length < 1 || o.tips.length > 2 || o.tips.some((p) => typeof p !== "string" || !p.trim())) errors.push("tips: 1–2 Tipps");
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { subject: o.subject!.trim(), paragraphs: o.paragraphs!.map((p) => p.trim()), tips: o.tips!.map((t) => t.trim()) } };
}

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "issues"],
  properties: { ok: { type: "boolean" }, issues: { type: "array", items: { type: "string" } } },
};

function validateCheck(x: unknown): Valid<CheckResult> {
  const o = x as Partial<CheckResult> | null;
  if (!o || typeof o.ok !== "boolean" || !Array.isArray(o.issues)) return { ok: false, errors: ["{ ok: boolean, issues: string[] } erwartet"] };
  return { ok: true, value: { ok: o.ok, issues: o.issues.filter((i): i is string => typeof i === "string") } };
}

const WRITER_SYSTEM = `Du schreibst den monatlichen Bericht von performancegrowth an einen Versicherungsvermittler (Kunde), Sie-Form, im Namen von Ole Kannapinn / performancegrowth.
Regeln:
- Nur Fakten aus den gelieferten Daten. Keine Zahl nennen, die nicht in den Daten steht. Keine Prozent-Werte selbst ausrechnen.
- Das Wort „Garantie“ (und Abwandlungen) nie verwenden. Keine Versprechen oder Zusicherungen („garantiert“, „sicher mehr“, „verdoppeln“).
- Ton: positiv-ehrlich, kurz, wertschätzend, nie vorwurfsvoll. Keine Floskeln, keine Ausrufezeichen-Kaskaden.
- Aufbau: 1) kurzer Einstieg mit den wichtigsten Kennzahlen des Monats (und Vergleich zum Vormonat, wenn vorhanden), 2) was wir diesen Monat getan haben, 3) unsere nächsten Schritte, 4) Angebot für ein kurzes Gespräch (15 Minuten).
- Bei Einstufung „mittel“ oder „schwach“: Schwerpunkt auf Maßnahmen und Ausblick, schwache Zahlen nicht betonen, nichts beschönigen und nichts erfinden.
- tips: 1–2 konkrete, freundliche Tipps für den Kunden (z. B. Leads innerhalb von 5 Minuten anrufen; Ergebnisse eintragen, damit wir gezielter optimieren können). Ohne Vorwurf.
- Keine Anrede (kommt separat), keine Grußformel/Signatur, keine Links, kein Markdown.
Antworte ausschließlich mit JSON laut Schema.`;

const CHECKER_SYSTEM = `Du prüfst einen Kundenbericht von performancegrowth vor dem Versand. Melde Probleme (issues) und setze ok=false, wenn:
- eine Zahl oder Behauptung nicht durch die gelieferten Daten gedeckt ist,
- „Garantie“ oder ein Versprechen/eine Zusicherung vorkommt,
- der Ton vorwurfsvoll, entmutigend oder übertrieben ist,
- Fehler in Rechtschreibung/Grammatik vorkommen.
Sonst ok=true und issues=[]. Antworte ausschließlich mit JSON laut Schema.`;

function writerInput(customerName: string, m: ReportMetrics, c: Classification, facts: Fact[]): string {
  return JSON.stringify(
    {
      kunde: customerName,
      monat: monthLabel(m.month),
      einstufung_intern: c.rating,
      datenlage: c.dataQuality === "ok" ? "verlässlich" : "zu wenige Ergebnisse eingetragen – keine Abschlussquote nennen, Tipp: Ergebnisse eintragen",
      kennzahlen: facts.map((f) => ({ name: f.label, wert: fmtValue(f), vormonat: f.previous != null ? fmtValue({ value: f.previous, unit: f.unit }) : null })),
      massnahmen_diesen_monat: m.actions.length ? m.actions : ["laufende Optimierung der Anzeigen und Zielgruppen"],
    },
    null,
    2,
  );
}

export type Generated = { draft: ReportDraft; check: CheckResult; usage: AgentUsage };

/** Text schreiben und prüfen; bei Befund genau eine Überarbeitung. */
export async function writeReport(customerName: string, m: ReportMetrics, c: Classification, llm: LlmCall = claudeCall): Promise<Generated> {
  const facts = visibleFacts(m, c);
  const allowed = allowedNumbers(m, facts);
  const input = writerInput(customerName, m, c, facts);
  let usage: AgentUsage = { tokensIn: 0, tokensOut: 0, costCents: 0 };
  let hint = "";
  let last: Generated | null = null;
  for (let round = 1; round <= 2; round++) {
    const w = await runAgent(llm, { agent: "Berichtsschreiber", system: WRITER_SYSTEM, user: hint ? `${input}\n\nBitte überarbeiten:\n- ${hint}` : input, schema: DRAFT_SCHEMA, maxTokens: 8000 }, validateDraft);
    usage = add(usage, w.usage);
    const text = [w.value.subject, ...w.value.paragraphs, ...w.value.tips].join("\n");
    const det = checkText(text, allowed);
    let ai: CheckResult = { ok: true, issues: [] };
    try {
      const r = await runAgent(llm, { agent: "Berichtsprüfer", system: CHECKER_SYSTEM, user: `Daten:\n${input}\n\nBericht:\n${text}`, schema: CHECK_SCHEMA, maxTokens: 4000 }, validateCheck);
      usage = add(usage, r.usage);
      ai = r.value;
    } catch (e) {
      ai = { ok: false, issues: [`KI-Prüfung nicht möglich: ${e instanceof Error ? e.message : e}`] };
    }
    const check = { ok: det.ok && ai.ok, issues: [...det.issues, ...ai.issues] };
    last = { draft: w.value, check, usage };
    if (check.ok) return last;
    hint = check.issues.join("\n- ");
  }
  return { ...last!, usage };
}

const add = (a: AgentUsage, b: AgentUsage): AgentUsage => ({ tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut, costCents: a.costCents + b.costCents });

// ─── E-Mail ──────────────────────────────────────────────────────────────

export function tilesHtml(facts: Fact[]): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const cells = facts
    .map(
      (f) => `<td style="padding:4px;width:${Math.floor(100 / Math.max(1, facts.length))}%"><div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc">
  <div style="font-size:12px;color:#64748b">${esc(f.label)}</div>
  <div style="font-size:18px;font-weight:700;color:#0b1220;margin-top:2px">${esc(fmtValue(f))}</div>
  ${f.previous != null ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">Vormonat ${esc(fmtValue({ value: f.previous, unit: f.unit }))}</div>` : ""}
</div></td>`,
    )
    .join("");
  return `<table role="presentation" style="width:100%;border-collapse:separate;margin:0 0 16px"><tr>${cells}</tr></table>`;
}

async function deliver(reportId: string, overrides?: { subject?: string; paragraphs?: string[] }): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await prisma.monthlyReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { customer: { select: { name: true, salesContact: { select: { id: true } }, users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } } } } },
  });
  const to = r.customer.users.map((u) => u.email);
  if (!to.length) return { ok: false, error: "Kein Inhaber-Login mit E-Mail beim Kunden." };
  const settings = await loadReportSettings();
  const body = r.body as { paragraphs: string[]; tips: string[]; facts: Fact[] };
  const paragraphs = overrides?.paragraphs ?? body.paragraphs;
  const subject = overrides?.subject ?? r.subject;
  const res = await sendCustomerMail({
    to,
    subject,
    greeting: await customerGreeting({ salesContactId: r.customer.salesContact?.id ?? null }),
    paragraphs,
    list: body.tips,
    html: tilesHtml(body.facts ?? []),
    button: { label: "Kurzes Gespräch vereinbaren", url: settings.bookingUrl ?? `${getAppUrl()}/buyer/zahlen` },
    signature: settings.senderName ?? `${PROVIDER.manager}\n${PROVIDER.brand}`,
  });
  return res.ok ? { ok: true } : res;
}

// ─── Erzeugen (Cron) ─────────────────────────────────────────────────────

export type RunOptions = { llm?: LlmCall; limit?: number; month?: string; customerIds?: string[] };

/** Berichte für den Vormonat erzeugen (idempotent je Kunde und Monat). */
export async function runMonthlyReports(now = new Date(), opts: RunOptions = {}) {
  const month = opts.month ?? previousMonthKey(now);
  const settings = await loadReportSettings();
  const customers = await prisma.customer.findMany({
    where: {
      archived: false,
      monthlyReportsOff: false,
      plan: { in: ["software", "service"] },
      monthlyReports: { none: { month } },
      ...(opts.customerIds ? { id: { in: opts.customerIds } } : {}),
    },
    select: { id: true, name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
    orderBy: { name: "asc" },
    take: opts.limit ?? 5,
  });
  const out = { month, created: 0, sent: 0, drafts: 0, skippedIneligible: 0, errors: 0 };
  for (const c of customers) {
    try {
      const m = await collectMetrics(c.id, month, settings);
      if (!eligible(m, settings)) {
        out.skippedIneligible++;
        continue;
      }
      const cls = classify(m, settings);
      const gen = await writeReport(c.name, m, cls, opts.llm);
      const facts = visibleFacts(m, cls);
      // Nur „gut“, geprüft und nur wenn eingeschaltet: automatisch senden. Alles andere bleibt Entwurf.
      const auto = cls.rating === "gut" && settings.autoSendGood && gen.check.ok;
      const row = await prisma.monthlyReport
        .create({
          data: {
            customerId: c.id,
            month,
            rating: cls.rating,
            dataQuality: cls.dataQuality,
            reasons: cls.reasons,
            metrics: m as unknown as Prisma.InputJsonValue,
            subject: gen.draft.subject,
            body: { paragraphs: gen.draft.paragraphs, tips: gen.draft.tips, facts } as unknown as Prisma.InputJsonValue,
            check: gen.check as unknown as Prisma.InputJsonValue,
            costCents: gen.usage.costCents,
          },
        })
        .catch((e: unknown) => {
          // Parallel schon angelegt (unique) → überspringen
          if (String(e).includes("Unique")) return null;
          throw e;
        });
      if (!row) continue;
      out.created++;
      if (auto) {
        const sent = await deliver(row.id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
        if (sent.ok) {
          await prisma.monthlyReport.update({ where: { id: row.id }, data: { status: "sent", sentAt: new Date(), decidedBy: "automatisch" } });
          out.sent++;
          continue;
        }
        // Versand fehlgeschlagen → Entwurf mit Hinweis, Ole sieht es in Heute
        gen.check.issues.push(`Automatischer Versand fehlgeschlagen: ${sent.error}`);
        await prisma.monthlyReport.update({ where: { id: row.id }, data: { check: gen.check as unknown as Prisma.InputJsonValue } });
      }
      out.drafts++;
      const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
      const advice = cls.rating === "schwach" ? "Empfehlung: anrufen statt schicken" : cls.rating === "mittel" ? "bitte prüfen" : gen.check.ok ? "kann so raus" : "Prüfung hat Hinweise";
      await prisma.salesTask
        .create({
          data: {
            contactId,
            type: "SONSTIGES",
            title: `Monatsbericht prüfen: ${c.name} (${cls.rating}) – ${advice}`,
            note: `Monat ${monthLabel(month)}. ${cls.reasons.join("; ")}${gen.check.issues.length ? `\nPrüfung: ${gen.check.issues.join("; ")}` : ""}\nAdmin → Monatsberichte`,
            dueAt: new Date(),
          },
        })
        .catch((err) => reportError(err, "bericht-task"));
    } catch (e) {
      out.errors++;
      reportError(e, "monatsbericht", { customer: c.id });
    }
  }
  if (out.drafts > 0) {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: `Monatsberichte ${monthLabel(month)}`, body: `${out.drafts} Bericht(e) warten auf deine Prüfung`, url: `/admin/monatsberichte?monat=${month}` }).catch(() => {});
  }
  return out;
}

// ─── Entscheidungen (Admin) ──────────────────────────────────────────────

type Result = { ok: true } | { ok: false; error: string };

export async function sendReport(id: string, actor: AuditActor, edited?: { subject: string; paragraphs: string[] }): Promise<Result> {
  const r = await prisma.monthlyReport.findUnique({ where: { id }, select: { status: true, customerId: true, body: true } });
  if (!r) return { ok: false, error: "Bericht nicht gefunden." };
  if (r.status === "sent") return { ok: false, error: "Schon gesendet." };
  if (edited) {
    const text = [edited.subject, ...edited.paragraphs].join("\n");
    if (/garantie/i.test(text)) return { ok: false, error: "Bitte das Wort „Garantie“ entfernen – Garantien erwähnen wir im Bericht nicht." };
    const body = r.body as Record<string, unknown>;
    await prisma.monthlyReport.update({ where: { id }, data: { subject: edited.subject.trim(), body: { ...body, paragraphs: edited.paragraphs } as Prisma.InputJsonValue } });
  }
  const res = await deliver(id).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
  if (!res.ok) return res;
  await prisma.monthlyReport.update({ where: { id }, data: { status: "sent", sentAt: new Date(), decidedBy: actor.email ?? "admin" } });
  await audit("bericht.send", { entity: "MonthlyReport", entityId: id, customerId: r.customerId, details: { edited: !!edited }, actor });
  return { ok: true };
}

/** „Nicht senden, ich rufe an“: Anruf-Aufgabe statt Bericht. */
export async function callInstead(id: string, actor: AuditActor): Promise<Result> {
  const r = await prisma.monthlyReport.findUnique({
    where: { id },
    select: { status: true, month: true, customerId: true, reasons: true, customer: { select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } } } },
  });
  if (!r) return { ok: false, error: "Bericht nicht gefunden." };
  if (r.status === "sent") return { ok: false, error: "Schon gesendet." };
  await prisma.monthlyReport.update({ where: { id }, data: { status: "call", decidedBy: actor.email ?? "admin" } });
  await prisma.salesTask.create({
    data: {
      contactId: r.customer.salesContact?.id ?? r.customer.onboarding?.salesContactId ?? null,
      type: "ANRUF",
      title: `Anrufen: ${r.customer.name} – Monat ${monthLabel(r.month)} besprechen`,
      note: `Statt Monatsbericht. Intern: ${((r.reasons as string[] | null) ?? []).join("; ")}`,
      dueAt: new Date(),
    },
  });
  await audit("bericht.call", { entity: "MonthlyReport", entityId: id, customerId: r.customerId, actor });
  return { ok: true };
}

export async function skipReport(id: string, actor: AuditActor): Promise<Result> {
  const r = await prisma.monthlyReport.findUnique({ where: { id }, select: { status: true, customerId: true } });
  if (!r) return { ok: false, error: "Bericht nicht gefunden." };
  if (r.status === "sent") return { ok: false, error: "Schon gesendet." };
  await prisma.monthlyReport.update({ where: { id }, data: { status: "skipped", decidedBy: actor.email ?? "admin" } });
  await audit("bericht.skip", { entity: "MonthlyReport", entityId: id, customerId: r.customerId, actor });
  return { ok: true };
}

export async function setCustomerReportsOff(customerId: string, off: boolean, actor: AuditActor) {
  await prisma.customer.update({ where: { id: customerId }, data: { monthlyReportsOff: off } });
  await audit("bericht.kunde", { entity: "Customer", entityId: customerId, customerId, details: { off }, actor });
}

// ─── Lesen ───────────────────────────────────────────────────────────────

export async function listReports(month: string) {
  return prisma.monthlyReport.findMany({
    where: { month },
    orderBy: [{ status: "asc" }, { rating: "desc" }],
    select: { id: true, rating: true, dataQuality: true, status: true, subject: true, sentAt: true, costCents: true, customer: { select: { id: true, name: true, monthlyReportsOff: true } } },
  });
}

/** Für den Kundenbereich: nur gesendete Berichte, ohne interne Einstufung. */
export async function sentReportsFor(customerId: string) {
  return prisma.monthlyReport.findMany({
    where: { customerId, status: "sent" },
    orderBy: { month: "desc" },
    take: 12,
    select: { id: true, month: true, subject: true, body: true, sentAt: true },
  });
}
