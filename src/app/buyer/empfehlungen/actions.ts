"use server";

// Modul „Empfehlungen & Bewertungen“ im Kundenbereich: buchen/kündigen (Inhaber),
// Einstellungen, Test, „Nicht anfragen“, „Geklärt“, Empfehlungslink senden, Hinweise.

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { canAccessLead } from "@/lib/team";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { bookEmpfehlung, cancelEmpfehlung, dismissHint } from "@/lib/empfehlung/module";
import { markResolved, sendReferralLinkNow, sendTestMessage, setReviewOptOut } from "@/lib/empfehlung/requests";
import { TEXT_LABELS, clampDelay, DEFAULT_DELAYS, normalizeGoogleUrl, validateText, type TextKey } from "@/lib/empfehlung/shared";

async function ownerCtx() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || ctx.teamRole !== "owner") return null;
  return ctx;
}

function refresh() {
  revalidatePath("/buyer", "layout");
}

export type ModuleActionState = { ok?: boolean; error?: string; message?: string; until?: string; trialEndsAt?: string | null };

export async function bookEmpfehlungAction(_prev: ModuleActionState, fd: FormData): Promise<ModuleActionState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann Module buchen (nicht in der Vorschau)." };
  const r = await bookEmpfehlung(ctx.customerId, { acknowledged: fd.get("confirm") === "on", actor: { id: ctx.userId, email: ctx.email, role: "BUYER" } });
  refresh();
  if (!r.ok) return { error: r.error };
  return {
    ok: true,
    trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
    message: r.state === "trial" ? "Freigeschaltet – Ihre Testphase läuft." : "Gebucht – das Modul ist freigeschaltet.",
  };
}

export async function cancelEmpfehlungAction(_prev: ModuleActionState, fd: FormData): Promise<ModuleActionState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann Module kündigen (nicht in der Vorschau)." };
  if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie die Kündigung." };
  const r = await cancelEmpfehlung(ctx.customerId, { actor: { id: ctx.userId, email: ctx.email, role: "BUYER" } });
  refresh();
  return r.ok ? { ok: true, until: r.until.toISOString() } : { error: r.error };
}

export async function dismissHintAction(key: string): Promise<void> {
  const ctx = await ownerCtx();
  if (!ctx) return;
  await dismissHint(ctx.customerId, key);
  refresh();
}

export type SettingsState = { ok?: boolean; error?: string };

export async function saveSettingsAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann die Einstellungen ändern." };
  const rawUrl = String(fd.get("googleReviewUrl") ?? "").trim();
  const googleReviewUrl = normalizeGoogleUrl(rawUrl);
  if (rawUrl && !googleReviewUrl) return { error: "Bitte einen vollständigen Link mit https:// eingeben." };
  const texts: Partial<Record<TextKey, string | null>> = {};
  for (const key of Object.keys(TEXT_LABELS) as TextKey[]) {
    const v = String(fd.get(`text_${key}`) ?? "").trim();
    const err = validateText(key, v);
    if (err) return { error: `${TEXT_LABELS[key].title}: ${err}` };
    texts[key] = v || null;
  }
  const data = {
    active: fd.get("active") === "on",
    googleReviewUrl,
    reviewDelayDays: clampDelay(fd.get("reviewDelayDays"), DEFAULT_DELAYS.review),
    referralDelayDays: clampDelay(fd.get("referralDelayDays"), DEFAULT_DELAYS.referral),
    reviewText: texts.review ?? null,
    thanksText: texts.thanks ?? null,
    unhappyText: texts.unhappy ?? null,
    referralText: texts.referral ?? null,
    referralThanksText: texts.referralThanks ?? null,
  };
  if (data.referralDelayDays <= data.reviewDelayDays) return { error: "Die Bitte um Empfehlung sollte nach der Nachfrage kommen (mehr Tage)." };
  await prisma.reviewSettings.upsert({ where: { customerId: ctx.customerId }, create: { customerId: ctx.customerId, ...data }, update: data });
  await audit("empfehlung.settings", { entity: "ReviewSettings", entityId: ctx.customerId, customerId: ctx.customerId, details: { active: data.active, google: !!googleReviewUrl, review: data.reviewDelayDays, referral: data.referralDelayDays } });
  refresh();
  return { ok: true };
}

export type TestState = { ok?: boolean; error?: string; message?: string };

export async function sendTestAction(_prev: TestState, fd: FormData): Promise<TestState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann Tests senden." };
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) return { error: "Bitte eine gültige Handynummer eingeben." };
  const r = await sendTestMessage(ctx.customerId, phone);
  return r.ok ? { ok: true, message: r.mode === "template" ? "Gesendet (freigegebene Vorlage)." : "Gesendet (Ihr eigener Text, Chat war offen)." } : { error: r.error };
}

export async function setOptOutAction(leadId: string, off: boolean): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { ok: false, error: "In der Vorschau nicht möglich." };
  if (!(await canAccessLead(ctx, leadId))) return { ok: false, error: "Kein Zugriff." };
  const r = await setReviewOptOut(ctx.customerId, leadId, off);
  refresh();
  return r;
}

export async function markResolvedAction(requestId: string): Promise<void> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return;
  await markResolved(ctx.customerId, requestId);
  refresh();
}

export type ShareState = { ok?: boolean; error?: string; message?: string; link?: string; text?: string };

/** „Empfehlungslink senden“ (Lead mit Abschluss/Bestandskunde). */
export async function sendReferralLinkAction(_prev: ShareState, fd: FormData): Promise<ShareState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { error: "In der Vorschau nicht möglich." };
  const m = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { empfehlungEnabled: true } });
  if (!m?.empfehlungEnabled) return { error: "Dafür braucht es das Modul „Empfehlungen & Bewertungen“." };
  const leadId = String(fd.get("leadId") ?? "") || undefined;
  const existingCustomerId = String(fd.get("existingCustomerId") ?? "") || undefined;
  if (leadId && !(await canAccessLead(ctx, leadId))) return { error: "Kein Zugriff." };
  if (!leadId && !existingCustomerId) return { error: "Kein Kontakt." };
  const r = await sendReferralLinkNow(ctx.customerId, leadId ? { leadId } : { existingCustomerId }, { id: ctx.userId, email: ctx.email, role: "BUYER" });
  if (r.ok) return { ok: true, message: "Empfehlungslink per WhatsApp verschickt." };
  return { error: r.error, link: r.link, text: r.text };
}
