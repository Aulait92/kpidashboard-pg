"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/vertrieb/auth";
import {
  addManualMeasure,
  approveMeasures,
  markSuggestionDone,
  planAccount,
  rejectMeasure,
  saveOptimizationSettings,
  setAccountSettings,
  syncMetaActivities,
  type AccountPlan,
} from "@/lib/optimierung/server";

export type OptState = { ok?: boolean; error?: string; info?: string; at?: number };
export type DryRunState = { ok?: boolean; error?: string; plan?: AccountPlan; saved?: boolean };

async function admin() {
  const s = await requireAuth();
  if (s.role !== "ADMIN") throw new Error("Nur Admins.");
  return { id: s.userId, email: s.email, role: s.role };
}

const eurOrNull = (v: FormDataEntryValue | null): number | null => {
  const t = String(v ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const refresh = (accountId?: string | null, customerId?: string | null) => {
  revalidatePath("/admin/optimierung");
  if (accountId) revalidatePath(`/admin/optimierung/${accountId}`);
  if (customerId) revalidatePath(`/admin/kunden/${customerId}/optimierung`);
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kundenakte)
};

/** Global: Lauf an/aus, Autopilot für alle Konten ohne eigene Einstellung. */
export async function saveGlobalAction(_prev: OptState, fd: FormData): Promise<OptState> {
  const actor = await admin();
  const next = await saveOptimizationSettings({ enabled: fd.get("enabled") === "on", autopilot: fd.get("autopilot") === "on" });
  await audit("optimierung.einstellungen", { entity: "OptimizationSettings", entityId: "default", details: next, actor }).catch(() => undefined);
  refresh();
  return { ok: true, at: Date.now() };
}

/** Je Konto: Modus (global/Vorschlag/Autopilot), Ziel-Leadpreis, vereinbartes Budget, Kampagnen-Stichwort. */
export async function saveAccountAction(_prev: OptState, fd: FormData): Promise<OptState> {
  const actor = await admin();
  const id = String(fd.get("accountId") ?? "");
  if (!id) return { error: "Konto fehlt." };
  const mode = String(fd.get("mode") ?? "global");
  const keyword = String(fd.get("campaignKeyword") ?? "").trim();
  await setAccountSettings(
    id,
    {
      autopilot: mode === "autopilot" ? true : mode === "vorschlag" ? false : null,
      targetCpl: eurOrNull(fd.get("targetCpl")),
      agreedDailyBudget: eurOrNull(fd.get("agreedDailyBudget")),
      campaignKeyword: keyword ? keyword.slice(0, 80) : null,
    },
    actor,
  );
  refresh(id, String(fd.get("customerId") ?? "") || null);
  return { ok: true, at: Date.now() };
}

export async function approveAllAction(accountId: string, customerId?: string | null): Promise<OptState> {
  const actor = await admin();
  const n = await approveMeasures({ accountId }, actor);
  refresh(accountId, customerId);
  return { ok: true, info: n ? `${n} freigegeben. Ausgeführt wird in den nächsten Minuten.` : "Nichts zum Freigeben." };
}

export async function approveOneAction(accountId: string, id: string, customerId?: string | null): Promise<OptState> {
  const actor = await admin();
  const n = await approveMeasures({ accountId, ids: [id] }, actor);
  refresh(accountId, customerId);
  return n ? { ok: true } : { error: "Schon entschieden." };
}

export async function rejectAction(accountId: string | null, id: string, note: string | null, customerId?: string | null): Promise<OptState> {
  const actor = await admin();
  const ok = await rejectMeasure(id, actor, note);
  refresh(accountId, customerId);
  return ok ? { ok: true } : { error: "Nicht mehr ablehnbar (schon ausgeführt oder entschieden)." };
}

export async function doneAction(accountId: string | null, id: string, note: string | null, customerId?: string | null): Promise<OptState> {
  const actor = await admin();
  const ok = await markSuggestionDone(id, actor, note);
  refresh(accountId, customerId);
  return ok ? { ok: true } : { error: "Nur Vorschläge können als erledigt markiert werden." };
}

/** „Maßnahme eintragen“ (von Hand) für Kunde bzw. Konto. */
export async function addManualAction(_prev: OptState, fd: FormData): Promise<OptState> {
  const actor = await admin();
  const accountId = String(fd.get("accountId") ?? "") || null;
  const customerId = String(fd.get("customerId") ?? "") || null;
  const day = String(fd.get("date") ?? "");
  const executedAt = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00Z`) : new Date(NaN);
  const r = await addManualMeasure(
    { accountId, customerId, topic: String(fd.get("topic") ?? ""), title: String(fd.get("title") ?? ""), reason: String(fd.get("reason") ?? ""), executedAt },
    actor,
  );
  if (!r.ok) return { error: r.error };
  refresh(accountId, customerId);
  return { ok: true, at: Date.now() };
}

/** Trockenlauf: Maßnahmen berechnen, nur lesende Meta-Aufrufe, nichts speichern. */
export async function dryRunAction(accountId: string): Promise<DryRunState> {
  await admin();
  try {
    return { ok: true, plan: await planAccount(accountId, { dryRun: true }) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lauf jetzt: wie der wöchentliche Lauf (plant und speichert; ausgeführt wird erst nach Freigabe bzw. im Autopilot). */
export async function runNowAction(accountId: string, customerId?: string | null): Promise<DryRunState> {
  await admin();
  try {
    const plan = await planAccount(accountId);
    refresh(accountId, customerId);
    return { ok: true, plan, saved: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncActivitiesAction(accountId: string, customerId?: string | null): Promise<OptState> {
  await admin();
  const r = await syncMetaActivities(new Date(), undefined, { accountId, force: true, max: 1 });
  refresh(accountId, customerId);
  if (r.errors.length) return { error: r.errors.join(" · ") };
  return { ok: true, info: r.accounts ? `${r.stored} neue Einträge` : "Kein Meta-Token bzw. Konto inaktiv." };
}
