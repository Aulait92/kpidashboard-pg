"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  buildCampaignRun,
  cleanupCampaignRun,
  getRunView,
  processCampaignRun,
  regenerateRunImage,
  startCampaignRun,
  updateRunCopy,
  type RunView,
} from "@/lib/kampagnen/run";
import type { Problem } from "@/lib/kampagnen/context";

async function admin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  return s;
}

export type StartState = { ok?: boolean; runId?: string; problems?: Problem[]; error?: string };

/** „Kampagne mit KI erstellen“ – der eine Knopf. Der Lauf arbeitet danach im Hintergrund. */
export async function startRunAction(_prev: StartState, fd: FormData): Promise<StartState> {
  try {
    const s = await admin();
    const customerId = String(fd.get("customerId") ?? "");
    const product = String(fd.get("product") ?? "").trim();
    if (!product) return { error: "Bitte ein Produkt wählen." };
    const pageId = String(fd.get("pageId") ?? "").trim().replace(/\D/g, "");
    const current = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { metaPageId: true } });
    if (pageId && pageId !== current.metaPageId) {
      await prisma.customer.update({ where: { id: customerId }, data: { metaPageId: pageId } });
      await audit("kampagne.seite", { entity: "Customer", entityId: customerId, customerId, details: { pageId } });
    }
    const r = await startCampaignRun({
      customerId,
      product,
      wish: String(fd.get("wish") ?? "").slice(0, 500),
      privacyUrl: String(fd.get("privacyUrl") ?? "").trim() || null,
      autoBuild: fd.get("autoBuild") === "on",
      createdBy: s.email ?? null,
    });
    if (!r.ok) return { problems: r.problems };
    after(() => processCampaignRun(r.runId).then(() => undefined));
    revalidatePath(`/admin/kunden/${customerId}/kampagne`);
    return { ok: true, runId: r.runId };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Start fehlgeschlagen." };
  }
}

export async function getRunAction(runId: string): Promise<RunView | null> {
  await admin();
  return getRunView(runId);
}

export type RunActionState = { ok?: boolean; error?: string; message?: string };

/** „Bei Meta anlegen (pausiert)“ bzw. nach einem Fehler fortsetzen. */
export async function buildRunAction(runId: string): Promise<RunActionState> {
  await admin();
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: runId }, select: { status: true, review: true, customerId: true } });
  if (!run.review) {
    // Fehler vor der Prüfung: Lauf ab dem fehlgeschlagenen Schritt fortsetzen
    await prisma.campaignRun.update({ where: { id: runId }, data: { status: "queued", error: null } });
    after(() => processCampaignRun(runId).then(() => undefined));
    return { ok: true, message: "Lauf wird fortgesetzt …" };
  }
  after(() => buildCampaignRun(runId).then(() => undefined));
  revalidatePath(`/admin/kunden/${run.customerId}/kampagne`);
  return { ok: true, message: "Wird pausiert bei Meta angelegt …" };
}

export async function updateCopyAction(runId: string, index: number, patch: Record<string, string>): Promise<RunActionState> {
  await admin();
  const r = await updateRunCopy(runId, index, patch);
  return r.ok ? { ok: true, message: "Gespeichert." } : { error: r.error };
}

export async function regenerateImageAction(runId: string, index: number): Promise<RunActionState> {
  await admin();
  const r = await regenerateRunImage(runId, index);
  return r.ok ? { ok: true, message: "Neues Bild erzeugt." } : { error: r.error };
}

export async function cleanupRunAction(runId: string): Promise<RunActionState> {
  await admin();
  const r = await cleanupCampaignRun(runId);
  return r.ok ? { ok: true, message: r.done?.length ? r.done.join(", ") : "Nichts angelegt – Lauf beendet." } : { error: r.error };
}
