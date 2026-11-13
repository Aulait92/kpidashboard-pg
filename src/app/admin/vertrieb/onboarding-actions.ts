"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endPauseNow, planPause } from "@/lib/pause";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { MANUAL_FIELDS, sendGoLiveMail, sendWelcome, startOnboarding } from "@/lib/onboarding";
import { logOfferActivity, setContactCustomerStage } from "@/lib/offer-links";

function refresh(contactId?: string | null) {
  revalidatePath("/admin/vertrieb", "layout");
  revalidatePath("/admin/kunden", "layout");
  if (contactId) revalidatePath(`/admin/vertrieb/kontakte/${contactId}`);
}

export async function startOnboardingAction(fd: FormData) {
  await requireAuth();
  const offerId = String(fd.get("offerId") ?? "");
  const customerId = String(fd.get("customerId") ?? "") || null;
  const res = await startOnboarding(offerId, { customerId });
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { salesContactId: true } });
  if (res.ok) await setContactCustomerStage({ dealId: null, salesContactId: offer?.salesContactId ?? null }, "ONBOARDING");
  refresh(offer?.salesContactId);
}

export async function toggleOnboardingStepAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  const step = String(fd.get("step") ?? "") as keyof typeof MANUAL_FIELDS;
  const field = MANUAL_FIELDS[step];
  if (!field) return;
  const ob = await prisma.onboarding.findUnique({ where: { id } });
  if (!ob) return;
  const value = ob[field] ? null : new Date();
  await prisma.onboarding.update({ where: { id }, data: { [field]: value } });
  refresh(ob.salesContactId);
}

export async function goLiveAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  const ob = await prisma.onboarding.findUnique({ where: { id } });
  if (!ob) return;
  const undo = !!ob.liveAt;
  await prisma.onboarding.update({
    where: { id },
    data: undo ? { liveAt: null, status: "running" } : { liveAt: new Date(), status: "live" },
  });
  const ref = { dealId: null, salesContactId: ob.salesContactId };
  if (!undo) {
    await setContactCustomerStage(ref, "TEST");
    await sendGoLiveMail(ob.id);
    await logOfferActivity(ref, "Onboarding abgeschlossen – Kunde ist live", "Kunden-Pipeline: Test · Go-live-Mail verschickt");
  }
  refresh(ob.salesContactId);
}

/** Selbst-Einrichtung: Erinnerung sofort an den Kunden (Mail + Push), unabhängig von Tag 1/3/7. */
export async function sendSetupReminderAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const { sendSetupReminderNow } = await import("@/lib/selbst-einrichtung");
  const res = await sendSetupReminderNow(customerId);
  refresh();
  redirect(`/admin/kunden/${customerId}?einrichtung=${res.ok ? "erinnert" : encodeURIComponent(res.error)}`);
}

/** Selbst-Einrichtung: Meta-Zugriff jetzt prüfen (mit den beim Kunden hinterlegten IDs). */
export async function adminCheckMetaAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const { checkMetaAccess } = await import("@/lib/selbst-einrichtung");
  const res = await checkMetaAccess(customerId, {}, { source: "admin" });
  refresh();
  redirect(`/admin/kunden/${customerId}?einrichtung=${res.ok ? (res.check.ok ? "meta-ok" : "meta-fehlt") : encodeURIComponent(res.error)}`);
}

export async function resendWelcomeAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  await sendWelcome(id);
  const ob = await prisma.onboarding.findUnique({ where: { id }, select: { salesContactId: true } });
  refresh(ob?.salesContactId);
}

// ─── Pause / Urlaub (Admin) ────────────────────────────────────────────

export async function adminPlanPauseAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const contactId = String(fd.get("contactId") ?? "") || null;
  const until = String(fd.get("until") ?? "").trim();
  const res = await planPause(customerId, { from: String(fd.get("from") ?? ""), until: until || null, reason: String(fd.get("reason") ?? "") }, "admin");
  refresh(contactId);
  if (!res.ok) redirect(`/admin/kunden/${customerId}/abrechnung?pause=${encodeURIComponent(res.error)}`);
}

export async function adminEndPauseAction(fd: FormData) {
  await requireAuth();
  const customerId = String(fd.get("customerId") ?? "");
  const contactId = String(fd.get("contactId") ?? "") || null;
  await endPauseNow(customerId, { admin: true });
  refresh(contactId);
}
