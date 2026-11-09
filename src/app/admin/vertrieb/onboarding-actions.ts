"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { MANUAL_FIELDS, sendWelcome, startOnboarding } from "@/lib/onboarding";
import { logOfferActivity, setContactCustomerStage } from "@/lib/offer-links";

function refresh(contactId?: string | null) {
  revalidatePath("/admin/vertrieb", "layout");
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
    await logOfferActivity(ref, "Onboarding abgeschlossen – Kunde ist live", "Kunden-Pipeline: Test");
  }
  refresh(ob.salesContactId);
}

export async function resendWelcomeAction(fd: FormData) {
  await requireAuth();
  const id = String(fd.get("id") ?? "");
  await sendWelcome(id);
  const ob = await prisma.onboarding.findUnique({ where: { id }, select: { salesContactId: true } });
  refresh(ob?.salesContactId);
}
