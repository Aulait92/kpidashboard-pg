"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { setWebhook } from "@/lib/whatsapp/dialog360";
import { appUrl } from "@/lib/whatsapp/event-text";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") throw new Error("Nicht erlaubt.");
}

const PURPOSES = new Set(["outreach", "booking_confirmation", "reminder"]);

/** Erstanschreiben je Kunde an/aus + Wartezeit. */
export async function saveOutreachSettingsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return;
  const enabled = formData.get("outreachEnabled") === "on";
  const delay = Math.min(
    24 * 60,
    Math.max(0, Number.parseInt(String(formData.get("outreachDelayMin") ?? "10"), 10) || 10),
  );
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
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.messageTemplate.delete({ where: { id } }).catch(() => {});
  revalidatePath("/admin/whatsapp/settings");
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
  revalidatePath("/admin/whatsapp/settings");
  redirect(back(ok ? "ok" : "webhook"));
}
