// Kampagnen-Automatik 2: „Produkt gebucht“ bzw. Angebot angenommen → Kampagnen-Lauf.
//
// Ein Wunsch (CampaignWish) startet sofort, wenn die Voraussetzungen erfüllt sind
// (Meta-Zugriff, Seite, Datenschutz-URL, Budget …). Fehlt etwas, bekommt Ole EINE
// Aufgabe mit der Liste; der Cron prüft offene Wünsche und startet automatisch,
// sobald alles da ist. Ist der Lauf fertig (pausiert angelegt), wird die Aufgabe
// erledigt; die Push-Nachricht mit Link kommt vom Lauf selbst.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { reportError } from "@/lib/monitoring";
import { loadAutomationSettings } from "@/lib/kampagnen/settings";
import { defaultDeps, processCampaignRun, startCampaignRun, type CampaignDeps } from "@/lib/kampagnen/run";
import type { Problem } from "@/lib/kampagnen/context";
import type { BuiltState } from "@/lib/kampagnen/types";

export type LaunchDeps = {
  campaign: CampaignDeps;
  /** Lauf im Hintergrund abarbeiten (Standard: after(), sonst übernimmt der Cron). */
  schedule: (runId: string) => Promise<void>;
};

export function defaultLaunchDeps(): LaunchDeps {
  const campaign = defaultDeps();
  return {
    campaign,
    schedule: async (runId) => {
      try {
        const { after } = await import("next/server");
        after(() => processCampaignRun(runId, campaign).then(() => undefined));
      } catch {
        // außerhalb einer Anfrage (z. B. Skript) – der Cron setzt den Lauf fort
      }
    },
  };
}

const RECHECK_MS = 30 * 60_000;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const norm = (s: string) => s.trim().toLowerCase();

async function contactOf(customerId: string): Promise<{ name: string; contactId: string | null }> {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
  });
  return { name: c.name, contactId: c.salesContact?.id ?? c.onboarding?.salesContactId ?? null };
}

/** Gibt es für Kunde + Produkt schon eine (nicht aufgeräumte) Kampagne aus dem Agenten-Team? */
async function hasCampaign(customerId: string, product: string): Promise<boolean> {
  const runs = await prisma.campaignRun.findMany({ where: { customerId, kind: "neu", status: "built" }, select: { product: true, built: true } });
  return runs.some((r) => norm(r.product) === norm(product) && !(r.built as unknown as BuiltState | null)?.cleanedAt);
}

export type LaunchResult = { status: "started" | "waiting" | "disabled" | "exists"; wishId?: string; runId?: string; problems?: Problem[] };

/** Wunsch anlegen und sofort versuchen zu starten. „disabled“ → Aufrufer legt die bisherige Aufgabe an. */
export async function requestCampaignLaunch(
  input: { customerId: string; product: string; source: "produkt" | "angebot"; bookingId?: string | null },
  deps: LaunchDeps = defaultLaunchDeps(),
  now = new Date(),
): Promise<LaunchResult> {
  const settings = await loadAutomationSettings();
  if (!settings.autoLaunch) return { status: "disabled" };
  const open = await prisma.campaignWish.findFirst({
    where: { customerId: input.customerId, product: { equals: input.product.trim(), mode: "insensitive" }, status: { in: ["waiting", "started"] } },
    select: { id: true },
  });
  if (open) return { status: "exists", wishId: open.id };
  if (await hasCampaign(input.customerId, input.product)) return { status: "exists" };
  const wish = await prisma.campaignWish.create({
    data: { customerId: input.customerId, product: input.product, source: input.source, bookingId: input.bookingId ?? null },
  });
  return tryStartWish(wish.id, deps, now);
}

/** Wunsch starten, wenn möglich; sonst Aufgabe mit fehlenden Voraussetzungen (einmal, wird aktualisiert). */
export async function tryStartWish(id: string, deps: LaunchDeps = defaultLaunchDeps(), now = new Date()): Promise<LaunchResult> {
  const wish = await prisma.campaignWish.findUniqueOrThrow({ where: { id } });
  if (wish.status !== "waiting") return { status: wish.status === "started" ? "started" : "exists", wishId: id, runId: wish.runId ?? undefined };
  const booking = wish.bookingId ? await prisma.productBooking.findUnique({ where: { id: wish.bookingId }, select: { dailyBudget: true, status: true } }) : null;
  if (booking && booking.status === "rejected") {
    await prisma.campaignWish.update({ where: { id }, data: { status: "cancelled", lastCheckedAt: now } });
    await closeTask(wish.taskId, now);
    return { status: "exists", wishId: id };
  }
  const r = await startCampaignRun(
    {
      customerId: wish.customerId,
      product: wish.product,
      autoBuild: true,
      createdBy: "automatik",
      trigger: "produkt",
      dailyBudgetEur: booking ? Number(booking.dailyBudget) : null,
    },
    deps.campaign,
  );
  if (r.ok) {
    await prisma.campaignWish.update({ where: { id }, data: { status: "started", runId: r.runId, problems: json([]), lastCheckedAt: now } });
    await closeTask(wish.taskId, now);
    await deps.schedule(r.runId);
    return { status: "started", wishId: id, runId: r.runId };
  }
  // Nur „läuft schon ein Lauf“ → still warten, später erneut
  const real = r.problems.filter((p) => p.key !== "running");
  await prisma.campaignWish.update({ where: { id }, data: { problems: json(r.problems), lastCheckedAt: now } });
  if (real.length) await upsertTask(wish.id, wish.customerId, wish.product, wish.taskId, real, now);
  return { status: "waiting", wishId: id, problems: r.problems };
}

async function upsertTask(wishId: string, customerId: string, product: string, taskId: string | null, problems: Problem[], now: Date) {
  const { name, contactId } = await contactOf(customerId);
  const note = [
    `Die Kampagne wird automatisch vom Agenten-Team angelegt (pausiert), sobald Folgendes erledigt ist:`,
    ...problems.map((p) => `• ${p.message}`),
    "",
    `Kundenakte → Kampagne (KI): /admin/kunden/${customerId}/kampagne`,
  ].join("\n");
  if (taskId) {
    const t = await prisma.salesTask.findUnique({ where: { id: taskId }, select: { doneAt: true } });
    if (t && !t.doneAt) {
      await prisma.salesTask.update({ where: { id: taskId }, data: { note } });
      return;
    }
  }
  const t = await prisma.salesTask.create({
    data: { contactId, type: "SONSTIGES", title: `Kampagne ${product} für ${name}: Voraussetzungen fehlen`, note, dueAt: now },
  });
  await prisma.campaignWish.update({ where: { id: wishId }, data: { taskId: t.id } });
}

async function closeTask(taskId: string | null, now: Date) {
  if (!taskId) return;
  await prisma.salesTask.updateMany({ where: { id: taskId, doneAt: null }, data: { doneAt: now } }).catch(() => undefined);
}

/** Cron: offene Wünsche starten bzw. Ergebnis der gestarteten Läufe übernehmen. */
export async function processCampaignWishes(now = new Date(), deps: LaunchDeps = defaultLaunchDeps()): Promise<{ started: number; done: number; failed: number }> {
  const out = { started: 0, done: 0, failed: 0 };
  const settings = await loadAutomationSettings();

  // Gestartete Läufe: fertig → Wunsch erledigt; gescheitert → Aufgabe mit Grund
  const started = await prisma.campaignWish.findMany({ where: { status: "started", runId: { not: null } }, take: 20 });
  for (const w of started) {
    const run = await prisma.campaignRun.findUnique({ where: { id: w.runId! }, select: { status: true, error: true } });
    if (!run) continue;
    if (run.status === "built") {
      await prisma.campaignWish.update({ where: { id: w.id }, data: { status: "done" } });
      out.done++;
    } else if (["blocked", "failed", "cancelled"].includes(run.status)) {
      const { name, contactId } = await contactOf(w.customerId);
      const t = await prisma.salesTask.create({
        data: {
          contactId,
          type: "SONSTIGES",
          title: `Kampagne ${w.product} für ${name}: automatisch nicht möglich`,
          note: [`Lauf ${run.status === "blocked" ? "von der Prüfung gestoppt" : "abgebrochen"}: ${run.error ?? "ohne Meldung"}`, `Kundenakte → Kampagne (KI): /admin/kunden/${w.customerId}/kampagne`].join("\n"),
          dueAt: now,
        },
      });
      await prisma.campaignWish.update({ where: { id: w.id }, data: { status: "failed", taskId: t.id } });
      out.failed++;
    }
  }

  if (!settings.autoLaunch) return out;
  const waiting = await prisma.campaignWish.findMany({
    where: { status: "waiting", OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - RECHECK_MS) } }] },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  for (const w of waiting) {
    try {
      if ((await tryStartWish(w.id, deps, now)).status === "started") out.started++;
    } catch (err) {
      reportError(err, "kampagne-wunsch", { wish: w.id });
    }
  }
  return out;
}
