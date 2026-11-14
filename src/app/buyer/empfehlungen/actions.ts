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
import { canSendReferral, loadSettings, markResolved, settleReward, planReferralFollowUp, referralLinkFor, referralLinkOf, sendReferralLinkNow, sendTestMessage, setReviewOptOut } from "@/lib/empfehlung/requests";
import { TEXT_LABELS, clampDelay, clampFollowUp, DEFAULT_DELAYS, DEFAULT_OFFER_KIND, isOccasion, normalizeGoogleUrl, validateOffer, validateReward, validateText, type TextKey } from "@/lib/empfehlung/shared";

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
  const rewardKind = String(fd.get("rewardKind") ?? "none");
  const rewardNote = String(fd.get("rewardNote") ?? "").trim();
  const rewardErr = validateReward(rewardKind, fd.get("rewardAmount"), rewardNote, fd.get("rewardConfirmed") === "on");
  if (rewardErr) return { error: `Dankeschön für Empfehlende: ${rewardErr}` };
  const rewardActive = rewardKind !== "none";
  const texts: Partial<Record<TextKey, string | null>> = {};
  for (const key of Object.keys(TEXT_LABELS) as TextKey[]) {
    const v = String(fd.get(`text_${key}`) ?? "").trim();
    const err = validateText(key, v, { rewardActive });
    if (err) return { error: `${TEXT_LABELS[key].title}: ${err}` };
    texts[key] = v || null;
  }
  const offerKind = String(fd.get("offerKind") ?? DEFAULT_OFFER_KIND);
  const offerHeadline = String(fd.get("offerHeadline") ?? "").trim();
  const offerText = String(fd.get("offerText") ?? "").trim();
  const offerErr = validateOffer(offerKind, offerHeadline, offerText);
  if (offerErr) return { error: `Empfehlungsangebot: ${offerErr}` };
  const data = {
    active: fd.get("active") === "on",
    offerKind,
    offerHeadline: offerKind === "custom" ? offerHeadline : null,
    offerText: offerKind === "custom" ? offerText : null,
    referralOnPraise: fd.get("referralOnPraise") === "on",
    statusUpdates: fd.get("statusUpdates") === "on",
    followUpHours: clampFollowUp(fd.get("followUpHours")),
    referralAfterAppointment: fd.get("referralAfterAppointment") === "on",
    praiseReferralText: texts.praiseReferral ?? null,
    rewardKind,
    rewardAmount: rewardActive ? Math.round(Number(fd.get("rewardAmount"))) : null,
    rewardNote: rewardActive ? rewardNote || null : null,
    rewardTrigger: fd.get("rewardTrigger") === "abschluss" ? "abschluss" : "termin",
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
  // Bestätigung der rechtlichen Prüfung: Zeitpunkt des ersten Einschaltens merken, beim Ausschalten löschen
  const before = await prisma.reviewSettings.findUnique({ where: { customerId: ctx.customerId }, select: { rewardConfirmedAt: true, rewardKind: true } });
  const rewardConfirmedAt = rewardActive ? (before?.rewardKind !== "none" && before?.rewardConfirmedAt ? before.rewardConfirmedAt : new Date()) : null;
  await prisma.reviewSettings.upsert({ where: { customerId: ctx.customerId }, create: { customerId: ctx.customerId, ...data, rewardConfirmedAt }, update: { ...data, rewardConfirmedAt } });
  await audit("empfehlung.settings", { entity: "ReviewSettings", entityId: ctx.customerId, customerId: ctx.customerId, details: { active: data.active, google: !!googleReviewUrl, review: data.reviewDelayDays, referral: data.referralDelayDays, offer: data.offerKind, praise: data.referralOnPraise, updates: data.statusUpdates, followUp: data.followUpHours, reward: rewardActive ? `${rewardKind}:${data.rewardAmount}:${data.rewardTrigger}` : null } });
  refresh();
  return { ok: true };
}

/** Hinweis „Google-Link fehlt“: Link direkt im Hinweis speichern (Ole, 14.11.2026). */
export async function saveGoogleUrlAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann das ändern." };
  const rawUrl = String(fd.get("googleReviewUrl") ?? "").trim();
  const googleReviewUrl = normalizeGoogleUrl(rawUrl);
  if (!googleReviewUrl) return { error: "Bitte einen vollständigen Link mit https:// eingeben." };
  await prisma.reviewSettings.upsert({ where: { customerId: ctx.customerId }, create: { customerId: ctx.customerId, googleReviewUrl }, update: { googleReviewUrl } });
  await audit("empfehlung.settings", { entity: "ReviewSettings", entityId: ctx.customerId, customerId: ctx.customerId, details: { google: true, via: "hinweis" } });
  refresh();
  return { ok: true };
}

/** Hinweis „pausiert“: automatisches Nachfragen wieder einschalten. */
export async function resumeAction(): Promise<void> {
  const ctx = await ownerCtx();
  if (!ctx) return;
  await prisma.reviewSettings.upsert({ where: { customerId: ctx.customerId }, create: { customerId: ctx.customerId, active: true }, update: { active: true } });
  await audit("empfehlung.settings", { entity: "ReviewSettings", entityId: ctx.customerId, customerId: ctx.customerId, details: { active: true, via: "hinweis" } });
  refresh();
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
  const occasionRaw = fd.get("occasion");
  const occasion = isOccasion(occasionRaw) ? occasionRaw : null;
  const r = await sendReferralLinkNow(ctx.customerId, leadId ? { leadId } : { existingCustomerId }, { id: ctx.userId, email: ctx.email, role: "BUYER" }, occasion);
  if (r.ok) {
    if (r.followUp) refresh();
    return { ok: true, message: r.followUp ? "Empfehlungslink per WhatsApp verschickt. Aufgabe zum Nachfassen ist angelegt." : "Empfehlungslink per WhatsApp verschickt." };
  }
  return { error: r.error, link: r.link, text: r.text };
}

export type QrState = { ok?: boolean; error?: string; url?: string; qr?: string; followUp?: boolean };

/**
 * „Im Termin zeigen“: QR-Code zum persönlichen Link des Kontakts. Der Kunde scannt ihn und teilt
 * die Empfehlung gleich am Tisch. Zählt als ausgegebener Link und legt die Aufgabe zum Nachfassen an.
 */
export async function referralQrAction(target: { leadId?: string; existingCustomerId?: string }): Promise<QrState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { error: "In der Vorschau nicht möglich." };
  const m = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { empfehlungEnabled: true } });
  if (!m?.empfehlungEnabled) return { error: "Dafür braucht es das Modul „Empfehlungen & Bewertungen“." };
  if (target.leadId) {
    if (!(await canAccessLead(ctx, target.leadId))) return { error: "Kein Zugriff." };
    if (!(await canSendReferral(ctx.customerId, target.leadId))) return { error: "Empfehlungslinks gibt es für Kontakte mit Abschluss und Bestandskunden." };
  } else if (target.existingCustomerId) {
    const e = await prisma.existingCustomer.findFirst({ where: { id: target.existingCustomerId, customerId: ctx.customerId }, select: { id: true } });
    if (!e) return { error: "Kontakt nicht gefunden." };
  } else return { error: "Kein Kontakt." };
  const link = await referralLinkOf({ customerId: ctx.customerId, leadId: target.leadId, existingCustomerId: target.leadId ? undefined : target.existingCustomerId });
  const url = referralLinkFor(link.token);
  const QRCode = (await import("qrcode")).default;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 480 });
  await prisma.referralLink.update({ where: { id: link.id }, data: { lastSentAt: new Date(), lastOccasion: "termin" } });
  const settings = await loadSettings(ctx.customerId);
  const followUp = await planReferralFollowUp(ctx.customerId, target.leadId, settings.followUpHours).catch(() => false);
  await audit("empfehlung.qr_shown", { entity: "ReferralLink", entityId: link.id, customerId: ctx.customerId, actor: { id: ctx.userId, email: ctx.email, role: "BUYER" } });
  if (followUp) refresh();
  return { ok: true, url, qr, followUp };
}



// ─── Bewertungs-Wächter ─────────────────────────────────────────────────────

export type GbpState = { ok?: boolean; error?: string; noAccess?: boolean };

export async function chooseLocationAction(_prev: GbpState, fd: FormData): Promise<GbpState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann das Unternehmensprofil verbinden." };
  const [accountName, locationName] = String(fd.get("location") ?? "").split("|");
  const title = String(fd.get(`title_${locationName}`) ?? "");
  const { chooseLocation, syncReviews } = await import("@/lib/empfehlung/google-business");
  try {
    await chooseLocation(ctx.customerId, { accountName: accountName ?? "", locationName: locationName ?? "", title: title || locationName || "" });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Standort konnte nicht gespeichert werden." };
  }
  await syncReviews(ctx.customerId).catch(() => null);
  refresh();
  return { ok: true };
}

export async function disconnectGbpAction(): Promise<void> {
  const ctx = await ownerCtx();
  if (!ctx) return;
  const { disconnect } = await import("@/lib/empfehlung/google-business");
  await disconnect(ctx.customerId);
  refresh();
}

export async function publishReplyAction(_prev: GbpState, fd: FormData): Promise<GbpState> {
  const ctx = await ownerCtx();
  if (!ctx) return { error: "Nur der Inhaber kann Antworten veröffentlichen." };
  const { publishReply } = await import("@/lib/empfehlung/google-business");
  const r = await publishReply(ctx.customerId, String(fd.get("reviewId") ?? ""), String(fd.get("reply") ?? ""));
  refresh();
  return r.ok ? { ok: true } : { error: r.error, noAccess: r.noAccess };
}


/** Dankeschön übergeben bzw. entfällt (z. B. Vertrag widerrufen). */
export async function settleRewardAction(leadId: string, outcome: "erledigt" | "entfaellt"): Promise<void> {
  const ctx = await ownerCtx();
  if (!ctx) return;
  if (await settleReward(ctx.customerId, leadId, outcome)) {
    await audit("empfehlung.reward", { entity: "Lead", entityId: leadId, customerId: ctx.customerId, details: { outcome }, actor: { id: ctx.userId, email: ctx.email, role: "BUYER" } });
  }
  refresh();
}
