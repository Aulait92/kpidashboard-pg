"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { saveAutomationSettings } from "@/lib/kampagnen/settings";
import { requireAuth } from "@/lib/vertrieb/auth";

export type AutomationState = { ok?: boolean; error?: string; savedAt?: number };

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));
const pct = (v: FormDataEntryValue | null) => num(v) / 100;

/** Schalter und Schwellen der Kampagnen-Automatik (nur Admin, mit Änderungsprotokoll). */
export async function saveAutomationAction(_prev: AutomationState, fd: FormData): Promise<AutomationState> {
  const session = await requireAuth();
  if (session.role !== "ADMIN") return { error: "Nur Admins." };
  const next = await saveAutomationSettings({
    budgetSync: fd.get("budgetSync") === "on",
    autoLaunch: fd.get("autoLaunch") === "on",
    refresh: fd.get("refresh") === "on",
    refreshMaxFrequency: num(fd.get("refreshMaxFrequency")),
    refreshCtrDrop: pct(fd.get("refreshCtrDrop")),
    refreshCplRise: pct(fd.get("refreshCplRise")),
    refreshMinSpendEur: num(fd.get("refreshMinSpendEur")),
  });
  await audit("kampagne.automatik", {
    entity: "CampaignAutomationSettings",
    entityId: "default",
    details: next,
    actor: { id: session.userId, email: session.email, role: session.role },
  }).catch(() => undefined);
  revalidatePath("/admin/einstellungen/kampagnen-automatik");
  return { ok: true, savedAt: Date.now() };
}
