"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { setWebhook } from "@/lib/whatsapp/dialog360";
import { appUrl } from "@/lib/whatsapp/event-text";
import { STARTER_PROMPT } from "@/lib/whatsapp/starter-prompt";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { resubmitTemplate, submitTemplatesForCustomer, summaryText } from "@/lib/whatsapp/template-submit";
import type { NoticePurpose } from "@/lib/whatsapp/templates";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nicht erlaubt.");
}

const PURPOSES = new Set([
  "outreach",
  "booking_confirmation",
  "reminder",
  "reschedule",
  "followup",
  "followup_offer",
  "followup_noshow",
  "followup_last",
  "campaign_cross_sell",
  "campaign_review",
  "campaign_birthday",
  "campaign_renewal",
]);

/** Erstanschreiben je Kunde an/aus + Wartezeit. */
export async function saveOutreachSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  const enabled = formData.get("outreachEnabled") === "on";
  // 0 = sofort beim Eingang anschreiben (Standard). Nur ungültige Eingaben fallen auf 0 zurück.
  const parsedDelay = Number.parseInt(String(formData.get("outreachDelayMin") ?? "0"), 10);
  const delay = Math.min(24 * 60, Math.max(0, Number.isFinite(parsedDelay) ? parsedDelay : 0));
  const rawRoom = String(formData.get("videoRoomUrl") ?? "").trim();
  // Nur https-Links zulassen (landen in Einladungen + WhatsApp).
  const videoRoomUrl = /^https:\/\/\S+$/i.test(rawRoom) ? rawRoom : null;
  const rawAdvisor = String(formData.get("advisorEmail") ?? "").trim().toLowerCase();
  const advisorEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawAdvisor) ? rawAdvisor : null;
  // ICS-Link: leer = unverändert lassen, „entfernen" = löschen, sonst neu
  // verschlüsselt speichern (wird nie wieder im Klartext angezeigt).
  const rawIcs = String(formData.get("availabilityIcsUrl") ?? "").trim();
  const removeIcs = formData.get("removeIcs") === "on";
  const icsUpdate = removeIcs
    ? { availabilityIcsUrlEnc: null }
    : /^(https|webcal):\/\/\S+$/i.test(rawIcs)
      ? { availabilityIcsUrlEnc: encryptSecret(rawIcs) }
      : {};
  const data = {
    outreachEnabled: enabled,
    outreachDelayMin: delay,
    videoRoomUrl,
    advisorEmail,
    ...icsUpdate,
  };
  await prisma.agentConfig.upsert({
    where: { customerId },
    create: { customerId, ...data },
    update: data,
  });
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
}

/**
 * Vorlage hinterlegen. Die Vorlage muss bei 360dialog/Meta mit exakt diesem
 * Namen, dieser Sprache und diesem Text angelegt und freigegeben sein.
 */
export async function saveTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  const purpose = String(formData.get("purpose") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const language = String(formData.get("language") ?? "de").trim() || "de";
  const body = String(formData.get("body") ?? "").trim();
  const status = formData.get("approved") === "on" ? "approved" : "pending";
  if (!customerId || !PURPOSES.has(purpose) || !name || !body) return;
  await prisma.messageTemplate.upsert({
    where: { customerId_name_language: { customerId, name, language } },
    create: {
      customerId,
      name,
      language,
      purpose,
      category: purpose === "outreach" ? "marketing" : "utility",
      status,
      body,
    },
    update: { purpose, status, body },
  });
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
}

/** Kunden für den WhatsApp-Assistenten vorbereiten (Agent noch inaktiv). */
export async function addCustomerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!exists) return;
  await prisma.agentConfig.upsert({
    where: { customerId },
    create: { customerId, active: false },
    update: {},
  });
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.messageTemplate.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
}

/**
 * WhatsApp-Nummer eines Kunden verbinden: 360dialog-API-Key (verschlüsselt)
 * speichern und die Webhook-URL bei 360dialog setzen. Die URL trägt die
 * Konto-ID, damit eingehende Nachrichten auch bei mehreren Kunden sicher dem
 * richtigen Kunden zugeordnet werden.
 */
export async function connectWhatsAppAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  const back = (state: string) =>
    `/admin/whatsapp/settings?wa=${state}&c=${encodeURIComponent(customerId)}#kunde-${customerId}`;

  const apiKeyRaw = String(formData.get("apiKey") ?? "").trim();
  const phone = String(formData.get("phoneNumber") ?? "").replace(/\D/g, "").replace(/^00/, "");
  const existing = await prisma.whatsAppAccount.findUnique({
    where: { customerId },
    select: { id: true, apiKeyEnc: true },
  });
  const apiKey = apiKeyRaw || (existing?.apiKeyEnc ? decryptSecret(existing.apiKeyEnc) : "");
  if (!apiKey) redirect(back("nokey"));
  const base = appUrl();
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!base || !secret) redirect(back("noconfig"));

  const account = await prisma.whatsAppAccount.upsert({
    where: { customerId },
    create: {
      customerId,
      provider: "360dialog",
      apiKeyEnc: encryptSecret(apiKey),
      phoneNumber: phone || null,
      status: "pending",
    },
    update: {
      // Neuer Key = evtl. neue Nummer → phone_number_id neu lernen.
      ...(apiKeyRaw ? { apiKeyEnc: encryptSecret(apiKey), phoneNumberId: null } : {}),
      ...(phone ? { phoneNumber: phone } : {}),
    },
    select: { id: true },
  });

  const url = `${base}/api/whatsapp/webhook?token=${encodeURIComponent(secret)}&acc=${account.id}`;
  let ok = true;
  try {
    await setWebhook(apiKey, url);
  } catch (err) {
    ok = false;
    console.error("[whatsapp connect]", err instanceof Error ? err.message : err);
  }
  await prisma.whatsAppAccount.update({
    where: { id: account.id },
    data: { status: ok ? "connected" : "pending" },
  });
  // Neuer Key: Vorlagen gleich automatisch bei Meta einreichen.
  if (ok && apiKeyRaw) await submitTemplatesForCustomer(customerId).catch((err) => reportError(err, "templates-after-admin-connect"));
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
  redirect(back(ok ? "ok" : "webhook"));
}

/** Admin-Knopf: fehlende Vorlagen einreichen und Status bei 360dialog abfragen. */
export async function submitTemplatesAction(customerId: string): Promise<SaveResult & { message?: string }> {
  try {
    await requireAdmin();
    const res = await submitTemplatesForCustomer(customerId);
    revalidateSettings();
    return res.ok ? { ok: true, message: summaryText(res) } : { ok: false, error: summaryText(res) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Einreichen fehlgeschlagen." };
  }
}

/** Abgelehnte Vorlage mit aktuellem Text neu einreichen. */
export async function resubmitTemplateAction(customerId: string, purpose: string): Promise<SaveResult & { message?: string }> {
  try {
    await requireAdmin();
    if (!PURPOSES.has(purpose)) return { ok: false, error: "Unbekannter Zweck." };
    const res = await resubmitTemplate(customerId, purpose as NoticePurpose);
    revalidateSettings();
    return res.ok ? { ok: true, message: `Neu eingereicht als ${res.name}` } : { ok: false, error: res.error ?? "Einreichen fehlgeschlagen." };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Einreichen fehlgeschlagen." };
  }
}

// ─── Demo-Daten (nur Sandbox: DEMO_TOOLS=1) ──────────────────────────────
/** Demo-Daten: in der Sandbox (DEMO_TOOLS=1) für alle, auf der Live-App nur für interne Testkunden. */
async function demoAllowed(customerId: string): Promise<boolean> {
  if (process.env.DEMO_TOOLS === "1") return true;
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { plan: true } });
  return c?.plan === "internal";
}

export async function seedDemoAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  if (!(await demoAllowed(customerId))) throw new Error("Testdaten nur für interne Testkunden.");
  const { seedDemoData } = await import("@/lib/demo-data");
  await seedDemoData(customerId);
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/buyer");
}

export async function removeDemoAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  if (!(await demoAllowed(customerId))) throw new Error("Testdaten nur für interne Testkunden.");
  const { removeDemoData } = await import("@/lib/demo-data");
  await removeDemoData(customerId);
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/buyer");
}

export type SaveResult = { ok: true } | { ok: false; error: string };

function revalidateSettings() {
  revalidatePath("/admin/whatsapp/settings");
  revalidatePath("/admin/kunden", "layout");
}

/** Assistent an/aus (Sofort-Schalter). Beim ersten Einschalten Start-Anweisung setzen. */
export async function setAgentActiveAction(customerId: string, active: boolean): Promise<SaveResult> {
  try {
    await requireAdmin();
    const cur = await prisma.agentConfig.findUnique({ where: { customerId }, select: { systemPrompt: true } });
    const prompt = cur?.systemPrompt?.trim() ? {} : { systemPrompt: STARTER_PROMPT };
    await prisma.agentConfig.upsert({
      where: { customerId },
      create: { customerId, active, systemPrompt: STARTER_PROMPT },
      update: { active, ...prompt },
    });
    await audit("agent.active", { entity: "AgentConfig", customerId, details: { active } });
    revalidateSettings();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/** Automatisch nachfassen (Nachfass-Abfolgen) an/aus. Ausschalten stoppt laufende Abfolgen beim nächsten Schritt. */
export async function setFollowUpSequencesAction(customerId: string, enabled: boolean): Promise<SaveResult> {
  try {
    await requireAdmin();
    await prisma.agentConfig.upsert({
      where: { customerId },
      create: { customerId, followUpSequencesEnabled: enabled, systemPrompt: STARTER_PROMPT },
      update: { followUpSequencesEnabled: enabled },
    });
    await audit("agent.sequences", { entity: "AgentConfig", customerId, details: { enabled } });
    revalidateSettings();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/** Einstellungen des Assistenten speichern (automatisch beim Ändern). */
export async function saveAgentSettingsAction(formData: FormData): Promise<SaveResult> {
  try {
    await saveOutreachSettingsAction(formData);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/** Vorlage speichern (Editor mit Vorschau). */
export async function saveTemplateResultAction(formData: FormData): Promise<SaveResult> {
  try {
    if (!String(formData.get("name") ?? "").trim() || !String(formData.get("body") ?? "").trim()) {
      return { ok: false, error: "Name und Text der Vorlage fehlen." };
    }
    await saveTemplateAction(formData);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/** Status einer Vorlage umschalten (freigegeben / wartet). */
export async function setTemplateApprovedAction(id: string, approved: boolean): Promise<SaveResult> {
  try {
    await requireAdmin();
    await prisma.messageTemplate.update({ where: { id }, data: { status: approved ? "approved" : "pending" } });
    revalidateSettings();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/** Kundenakte: Kunde als internen Testkunden markieren (zählt nicht in Zahlen/Umsätzen). */
export async function markTestCustomerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId || formData.get("confirm") !== "on") return;
  await prisma.customer.update({ where: { id: customerId }, data: { plan: "internal" } });
  revalidatePath(`/admin/kunden/${customerId}`);
  revalidatePath("/admin/kunden", "layout");
}
