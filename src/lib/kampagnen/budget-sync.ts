// Kampagnen-Automatik 1: Budgetänderung des Kunden automatisch bei Meta umsetzen.
//
// Gilt eine Budgetänderung (sofort oder am Stichtag im Cron), sucht die App je Produkt
// die Kampagne des Kunden: zuerst bekannte Meta-Kampagnen aus CampaignRun (vom
// Agenten-Team angelegt), sonst das Benennungsschema „PG | <Kunde> | <Produkt> | …“
// auf dem Werbekonto. Nur bei GENAU EINER eindeutigen Kampagne wird das Tagesbudget
// (Kampagnenbudget, Cent) gesetzt. Der Status wird NIE geändert. Sonst: Aufgabe wie bisher.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { graphApi, type MetaApi } from "@/lib/kampagnen/builder";
import { loadAutomationSettings } from "@/lib/kampagnen/settings";
import type { BuiltState } from "@/lib/kampagnen/types";

export type BudgetSyncDeps = {
  meta: MetaApi;
  notify: (title: string, body: string, url: string) => Promise<void>;
  task: (contactId: string | null, title: string, note: string | null, dueAt: Date) => Promise<void>;
};

type Change = { product: string; from: number; to: number };
type MetaCampaign = { id: string; name: string; status?: string; effective_status?: string; daily_budget?: string };

const eurDay = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €/Tag`;
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const GONE = new Set(["DELETED", "ARCHIVED"]);

export function defaultBudgetSyncDeps(): BudgetSyncDeps {
  return {
    meta: graphApi,
    notify: async (title, body, url) => {
      await (await import("@/lib/push")).sendToAdmins({ title, body, url }).catch(() => undefined);
    },
    task: async (contactId, title, note, dueAt) => {
      await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt } }).catch((err) => reportError(err, "budget-meta-task"));
    },
  };
}

/** Body für die Budgetänderung: nur daily_budget – niemals Status-Felder. */
export function budgetOnlyBody(dailyBudgetEur: number): Record<string, unknown> {
  return { daily_budget: Math.round(dailyBudgetEur * 100) };
}

/** Präfix des Benennungsschemas (siehe campaignName in types.ts). */
export const namePrefix = (customer: string, product: string) => norm(`PG | ${customer} | ${product} |`);

export type CampaignMatch = { ok: true; campaign: MetaCampaign } | { ok: false; reason: string };

/** Genau eine Kampagne je Kunde + Produkt finden (bekannte IDs vor Benennungsschema). */
export async function findCampaignForProduct(
  meta: MetaApi,
  input: { customerId: string; customerName: string; adAccountId: string; product: string },
): Promise<CampaignMatch> {
  const runs = await prisma.campaignRun.findMany({
    where: { customerId: input.customerId, kind: "neu", status: "built" },
    select: { product: true, built: true },
  });
  const known = [
    ...new Set(
      runs
        .filter((r) => norm(r.product) === norm(input.product))
        .map((r) => r.built as unknown as BuiltState | null)
        .filter((b): b is BuiltState => !!b?.campaignId && !b.cleanedAt)
        .map((b) => b.campaignId!),
    ),
  ];
  const alive: MetaCampaign[] = [];
  for (const id of known) {
    try {
      const c = await meta.get<MetaCampaign>(id, { fields: "id,name,status,effective_status,daily_budget" });
      if (!GONE.has(c.effective_status ?? c.status ?? "")) alive.push(c);
    } catch {
      // gelöscht bzw. kein Zugriff → nicht mitzählen
    }
  }
  let found = alive;
  if (!found.length) {
    const r = await meta.get<{ data: MetaCampaign[] }>(`act_${input.adAccountId}/campaigns`, { fields: "id,name,status,effective_status,daily_budget", limit: "200" });
    const prefix = namePrefix(input.customerName, input.product);
    found = (r.data ?? []).filter((c) => norm(c.name).startsWith(prefix) && !GONE.has(c.effective_status ?? c.status ?? ""));
  }
  if (found.length === 0) return { ok: false, reason: `keine Kampagne „PG | ${input.customerName} | ${input.product} | …“ gefunden` };
  if (found.length > 1) return { ok: false, reason: `${found.length} passende Kampagnen (${found.map((c) => c.name).join(", ").slice(0, 200)}) – nicht eindeutig` };
  if (!found[0].daily_budget) return { ok: false, reason: `Kampagne „${found[0].name}“ hat kein Kampagnenbudget (Budget auf Anzeigengruppen-Ebene)` };
  return { ok: true, campaign: found[0] };
}

export type SyncResult = { status: "done" | "manual" | "disabled" | "skipped"; done: string[]; problems: string[] };

/**
 * Budgetänderung bei Meta umsetzen. Idempotent: nur Änderungen mit metaStatus
 * none/scheduled (und status applied) werden genau einmal bearbeitet.
 * Bei Misserfolg Aufgabe „Meta-Budget …“ mit Grund.
 */
export async function syncBudgetChangeToMeta(changeId: string, deps: BudgetSyncDeps = defaultBudgetSyncDeps(), now = new Date()): Promise<SyncResult> {
  const claimed = await prisma.budgetChange.updateMany({
    where: { id: changeId, status: "applied", metaStatus: { in: ["none", "scheduled"] }, effectiveFrom: { lte: now } },
    data: { metaStatus: "processing" },
  });
  if (claimed.count === 0) return { status: "skipped", done: [], problems: [] };
  const ch = await prisma.budgetChange.findUniqueOrThrow({
    where: { id: changeId },
    include: { customer: { select: { id: true, name: true, metaAdAccountId: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } } } },
  });
  const changes = (Array.isArray(ch.changes) ? ch.changes : []) as unknown as Change[];
  const contactId = ch.customer.salesContact?.id ?? ch.customer.onboarding?.salesContactId ?? null;
  const settings = await loadAutomationSettings();
  const done: string[] = [];
  const problems: string[] = [];

  if (!settings.budgetSync) {
    problems.push("Automatik aus (Einstellungen → Kampagnen-Automatik)");
  } else if (!ch.customer.metaAdAccountId) {
    problems.push("kein Meta-Werbekonto hinterlegt");
  } else if (!process.env.META_ACCESS_TOKEN && deps.meta === graphApi) {
    problems.push("META_ACCESS_TOKEN fehlt");
  } else {
    for (const c of changes) {
      try {
        const m = await findCampaignForProduct(deps.meta, { customerId: ch.customerId, customerName: ch.customer.name, adAccountId: ch.customer.metaAdAccountId, product: c.product });
        if (!m.ok) {
          problems.push(`${c.product}: ${m.reason}`);
          continue;
        }
        const body = budgetOnlyBody(c.to);
        if ("status" in body || "configured_status" in body || "effective_status" in body) throw new Error("Sicherheitsstopp: Status darf hier nicht geändert werden.");
        await deps.meta.post(m.campaign.id, body);
        done.push(`${c.product}: „${m.campaign.name}“ auf ${eurDay(c.to)}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        problems.push(`${c.product}: ${/ads_management|has NOT grant|#200|#10/i.test(msg) ? "kein Zugriff auf das Werbekonto (Partnerzugriff „Kampagnen verwalten“ fehlt)" : msg.slice(0, 200)}`);
        reportError(err, "budget-meta-sync", { change: changeId });
      }
    }
  }

  const ok = problems.length === 0 && done.length === changes.length && changes.length > 0;
  await prisma.budgetChange.update({
    where: { id: changeId },
    data: { metaStatus: ok ? "done" : settings.budgetSync ? "manual" : "none", metaNote: [...done, ...problems].join(" · ").slice(0, 1000) || null },
  });
  if (done.length) {
    await audit("budget.meta", { entity: "BudgetChange", entityId: changeId, customerId: ch.customerId, details: { done, problems }, actor: { role: "system" } }).catch(() => undefined);
  }
  if (ok) {
    await deps.notify(`Budget bei Meta umgestellt: ${ch.customer.name}`, done.join(" · ").slice(0, 180), `/admin/kunden/${ch.customerId}/abrechnung`);
    return { status: "done", done, problems };
  }
  const open = changes.filter((c) => !done.some((d) => d.startsWith(`${c.product}:`)));
  await deps.task(
    contactId,
    `Meta-Budget ${ch.customer.name}: ${open.map((c) => `${c.product} auf ${eurDay(c.to)}`).join(", ")}`,
    [settings.budgetSync ? "Automatisch nicht möglich:" : null, ...problems, ...(done.length ? ["Bereits umgestellt:", ...done] : [])].filter(Boolean).join("\n"),
    now,
  );
  return { status: settings.budgetSync ? "manual" : "disabled", done, problems };
}

/** Cron: geplante Budgetänderungen bei Meta umsetzen, sobald sie gelten. */
export async function processDueMetaBudgets(now = new Date(), deps: BudgetSyncDeps = defaultBudgetSyncDeps()): Promise<number> {
  const due = await prisma.budgetChange.findMany({ where: { status: "applied", metaStatus: "scheduled", effectiveFrom: { lte: now } }, select: { id: true }, take: 20 });
  let n = 0;
  for (const d of due) if ((await syncBudgetChangeToMeta(d.id, deps, now)).status === "done") n++;
  return n;
}
