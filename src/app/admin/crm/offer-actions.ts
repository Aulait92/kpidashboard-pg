"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { getAppUrl, sendOfferEmail } from "@/lib/email";
import {
  createOffer,
  OFFER_SENT_STATUS,
  type OfferFormInput,
} from "@/lib/offers";
import { prisma } from "@/lib/prisma";
import { customerGreeting, logOfferActivity, offerAdminHref, type OfferTarget } from "@/lib/offer-links";
import {
  findSalesPhaseForStatus,
  SALES_PIPELINE_PHASES,
} from "@/lib/sales-phases";
import { setDealStatusAction } from "./actions";

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN")
    throw new Error("Nicht berechtigt.");
  return session;
}

export type OfferActionResult =
  | { ok: true; offerId?: string }
  | { ok: false; error: string };

export async function createOfferAction(
  target: OfferTarget,
  input: OfferFormInput,
): Promise<OfferActionResult> {
  const session = await requireAdmin();
  try {
    const offer = await createOffer(target, input, session.userId);
    await logOfferActivity(
      offer,
      `Angebot ${offer.number} erstellt`,
      `${Number(offer.setupFee).toLocaleString("de-DE")} € Setup · ${Number(offer.monthlyFee).toLocaleString("de-DE")} € / Monat (netto)`,
      session.userId,
    );
    revalidatePath(offerAdminHref(offer));
    return { ok: true, offerId: offer.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Angebot konnte nicht erstellt werden.",
    };
  }
}

/** Deal auf „Angebot verschickt“, solange er noch davor steht. */
async function advanceDeal(dealId: string | null) {
  if (!dealId) return;
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { status: true },
  });
  const order = SALES_PIPELINE_PHASES.map((p) => p.key);
  const current = findSalesPhaseForStatus(deal?.status ?? "");
  const target = findSalesPhaseForStatus(OFFER_SENT_STATUS);
  if (!target) return;
  if (current?.terminal) return;
  if (current && order.indexOf(current.key) >= order.indexOf(target.key))
    return;
  await setDealStatusAction(dealId, OFFER_SENT_STATUS);
}

export async function markOfferSentAction(
  offerId: string,
): Promise<OfferActionResult> {
  await requireAdmin();
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, dealId: true, salesContactId: true, number: true, status: true },
  });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "draft") {
    await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "sent", sentAt: new Date() },
    });
  }
  if (offer.salesContactId) await logOfferActivity(offer, `Angebot ${offer.number} als verschickt markiert`);
  await advanceDeal(offer.dealId);
  revalidatePath(offerAdminHref(offer));
  return { ok: true };
}

export async function sendOfferEmailAction(
  offerId: string,
): Promise<OfferActionResult> {
  const session = await requireAdmin();
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (!offer.email)
    return {
      ok: false,
      error: "Im Angebot ist keine E-Mail-Adresse hinterlegt.",
    };
  if (offer.status === "superseded" || offer.status === "accepted") {
    return { ok: false, error: "Dieses Angebot ist nicht mehr offen." };
  }
  const res = await sendOfferEmail({
    to: offer.email,
    greeting: await customerGreeting(offer),
    number: offer.number,
    offerUrl: `${getAppUrl()}/angebot/${offer.token}`,
    validUntil: offer.validUntil,
    replyTo: process.env.OFFER_REPLY_TO ?? session.email ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  await prisma.offer.update({
    where: { id: offer.id },
    data: { status: "sent", sentAt: offer.sentAt ?? new Date() },
  });
  await logOfferActivity(
    offer,
    `Angebot ${offer.number} per E-Mail an ${offer.email} gesendet`,
    null,
    session.userId,
  );
  await advanceDeal(offer.dealId);
  revalidatePath(offerAdminHref(offer));
  return { ok: true };
}
